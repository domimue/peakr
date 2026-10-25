import { create } from 'zustand';

import { personalBuild } from '@/config/build';

import {
  accessOf,
  changeFrom,
  entitlementsOf,
  NO_ENTITLEMENTS,
  subscriptionsOf,
  type Access,
  type ActiveSubscription,
  type BillingStatus,
  type CustomerInfoLike,
  type Entitlements,
} from './model';
import type { PackageSummary, PurchaseResult } from './billing-client';

/**
 * Billing state. The SDK is loaded lazily so screens, tests and builds without a RevenueCat key
 * keep working: without billing the user simply has no entitlements (development builds still get
 * the full plan, see `accessOf`).
 */

interface BillingState {
  /** `unavailable`: no RevenueCat key in this build; `error`: the SDK failed at start-up. */
  status: BillingStatus;
  entitlements: Entitlements;
  subscriptions: ActiveSubscription[];
  /** Packages of the tier offering (`default`), with store prices and trial length. */
  tierPackages: PackageSummary[];
  /** Packages of the Gym add-on offering, with store prices. */
  gymPackages: PackageSummary[];
  prices: Record<string, string>;
  /** Last access level on this device (offline start-up fallback). */
  cachedAccess: Access | null;
  /** Development builds only: unlocks the add-on / the training tier without a purchase. */
  devGym: boolean;
  devTraining: boolean;
  init: (userId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  /** Starts a tier, or switches tier / period through the store's change flow. */
  buyTier: (packageId: string) => Promise<PurchaseResult>;
  buyGym: (packageId: string) => Promise<PurchaseResult>;
  restore: () => Promise<boolean>;
  setDevGym: (on: boolean) => void;
  setDevTraining: (on: boolean) => void;
}

let unsubscribe: (() => void) | null = null;

async function client() {
  return import('./billing-client');
}

async function repository() {
  return import('@/data/repositories/billing-repository');
}

export const useBillingStore = create<BillingState>()((set, get) => {
  const apply = (info: CustomerInfoLike) => {
    const entitlements = entitlementsOf(info);
    set({ entitlements, subscriptions: subscriptionsOf(info, get().prices) });
    const access = accessOf({ status: 'ready', entitlements, devBuild: false, cached: null });
    set({ cachedAccess: access });
    void repository()
      .then((r) => r.saveCachedAccess(access))
      .catch(() => undefined);
  };

  return {
    status: 'idle',
    entitlements: NO_ENTITLEMENTS,
    subscriptions: [],
    tierPackages: [],
    gymPackages: [],
    prices: {},
    cachedAccess: null,
    devGym: false,
    devTraining: false,

    async init(userId) {
      set({ status: 'loading' });
      if (get().cachedAccess === null) {
        const cached = await repository()
          .then((r) => r.getCachedAccess())
          .catch(() => null);
        set({ cachedAccess: cached });
      }
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
          billing.loadOfferings().catch(() => ({ tiers: [], gym: [], prices: {} })),
        ]);
        set({
          tierPackages: offerings.tiers,
          gymPackages: offerings.gym,
          prices: offerings.prices,
        });
        apply(info);
        set({ status: 'ready' });
      } catch (error) {
        console.warn('Billing init failed', String(error));
        set({ status: 'error' });
      }
    },

    async refresh() {
      if (get().status !== 'ready') return;
      const billing = await client();
      apply(await billing.getCustomerInfo());
    },

    async buyTier(packageId) {
      const target = get().tierPackages.find((p) => p.id === packageId);
      if (!target) return 'error';
      const current = get().subscriptions.find((s) => s.kind === 'tier');
      const old = changeFrom(current, target);
      // A downgrade: Plus → Training, or yearly → monthly within the same tier.
      const downgrade =
        current?.entitlement === 'plus'
          ? target.tier === 'training'
          : current?.period === 'yearly' && target.period === 'monthly';
      const billing = await client();
      const result = await billing.purchase(packageId, {
        replace: old ? { productId: old, downgrade } : null,
      });
      if (result === 'purchased') await get().refresh();
      return result;
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
    setDevTraining: (devTraining) => set({ devTraining: __DEV__ && devTraining }),
  };
});

/** Whether the Gym add-on is active (or granted in a development or personal build). */
export function useHasGym(): boolean {
  return useBillingStore((s) => personalBuild || s.entitlements.gym || s.devGym);
}

export function useTier(): Entitlements['tier'] {
  return useBillingStore((s) => s.entitlements.tier);
}

/**
 * What the training plan may show and do (`full` / `readOnly` / `preview` / `pending`). A personal
 * build (`@/config/build`) always has `full`.
 */
export function useAccess(): Access {
  return useBillingStore((s) =>
    personalBuild || s.devTraining
      ? 'full'
      : accessOf({
          status: s.status,
          entitlements: s.entitlements,
          devBuild: __DEV__,
          cached: s.cachedAccess,
        }),
  );
}

/** Editing, regenerating, pausing, routes, integrations and exports need `full`. */
export function useCanEditPlan(): boolean {
  return useAccess() === 'full';
}
