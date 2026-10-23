import { create } from 'zustand';

import {
  entitlementsOf,
  NO_ENTITLEMENTS,
  subscriptionsOf,
  type ActiveSubscription,
  type CustomerInfoLike,
  type Entitlements,
} from './model';
import type { PackageSummary, PurchaseResult } from './billing-client';

/**
 * Billing state. The SDK is loaded lazily so screens, tests and builds without a RevenueCat key
 * keep working: without billing the user simply has no entitlements.
 */

interface BillingState {
  /** `unavailable`: no RevenueCat key in this build. */
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  entitlements: Entitlements;
  subscriptions: ActiveSubscription[];
  /** Packages of the Gym add-on offering, with store prices. */
  gymPackages: PackageSummary[];
  prices: Record<string, string>;
  /** Development builds only: unlocks the add-on without a purchase. */
  devGym: boolean;
  init: (userId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  buyGym: (packageId: string) => Promise<PurchaseResult>;
  restore: () => Promise<boolean>;
  setDevGym: (on: boolean) => void;
}

let unsubscribe: (() => void) | null = null;

async function client() {
  return import('./billing-client');
}

export const useBillingStore = create<BillingState>()((set, get) => {
  const apply = (info: CustomerInfoLike) =>
    set({
      entitlements: entitlementsOf(info),
      subscriptions: subscriptionsOf(info, get().prices),
    });

  return {
    status: 'idle',
    entitlements: NO_ENTITLEMENTS,
    subscriptions: [],
    gymPackages: [],
    prices: {},
    devGym: false,

    async init(userId) {
      set({ status: 'loading' });
      try {
        const billing = await client();
        if (!(await billing.configureBilling(userId))) {
          set({ status: 'unavailable', entitlements: NO_ENTITLEMENTS, subscriptions: [] });
          return;
        }
        unsubscribe?.();
        unsubscribe = billing.onCustomerInfo(apply);
        const [info, offerings] = await Promise.all([
          billing.getCustomerInfo(),
          billing.loadOfferings().catch(() => ({ gym: [], prices: {} })),
        ]);
        set({ gymPackages: offerings.gym, prices: offerings.prices, status: 'ready' });
        apply(info);
      } catch (error) {
        console.warn('Billing init failed', String(error));
        set({ status: 'unavailable' });
      }
    },

    async refresh() {
      if (get().status !== 'ready') return;
      const billing = await client();
      apply(await billing.getCustomerInfo());
    },

    async buyGym(packageId) {
      const billing = await client();
      const result = await billing.purchase(packageId);
      if (result === 'purchased') await get().refresh();
      return result;
    },

    async restore() {
      const billing = await client();
      const ok = await billing.restore();
      if (ok) await get().refresh();
      return ok;
    },

    setDevGym: (devGym) => set({ devGym: __DEV__ && devGym }),
  };
});

/** Whether the Gym add-on is active (or granted in a development build). */
export function useHasGym(): boolean {
  return useBillingStore((s) => s.entitlements.gym || s.devGym);
}

export function useTier(): Entitlements['tier'] {
  return useBillingStore((s) => s.entitlements.tier);
}
