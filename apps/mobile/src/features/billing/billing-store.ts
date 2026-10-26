import { create } from 'zustand';

import { personalBuild } from '@/config/build';

import {
  accessOf,
  addonGuardOf,
  addonStateOf,
  bodySubscriptionOf,
  changeFrom,
  entitlementsOf,
  NO_ENTITLEMENTS,
  subscriptionsOf,
  type Access,
  type ActiveSubscription,
  type AddonGuard,
  type BillingStatus,
  type CachedAddon,
  type CustomerInfoLike,
  type Entitlements,
} from './model';
import { remoteFlagOn, useRemoteFlagsStore, type RemoteFlags } from '@/config/remote-flags';
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
  /** Packages of the Body add-on offering (the bundle is a tier package, `plus`). */
  bodyPackages: PackageSummary[];
  /**
   * The account already used the Body trial (server table `addon_trials`, or Body was active
   * before). Null until known; the paywall then offers no trial rather than a wrong one.
   */
  bodyTrialUsed: boolean | null;
  prices: Record<string, string>;
  /** Last access level on this device (offline start-up fallback). */
  cachedAccess: Access | null;
  cachedAddon: CachedAddon | null;
  /** Development builds only: unlocks the add-ons / the training tier without a purchase. */
  devGym: boolean;
  devBody: boolean;
  devTraining: boolean;
  init: (userId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  /** Starts a tier, or switches tier / period through the store's change flow. */
  buyTier: (packageId: string) => Promise<PurchaseResult>;
  buyGym: (packageId: string) => Promise<PurchaseResult>;
  buyBody: (packageId: string) => Promise<PurchaseResult>;
  restore: () => Promise<boolean>;
  setDevGym: (on: boolean) => void;
  setDevBody: (on: boolean) => void;
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
    const addon: CachedAddon = entitlements.body
      ? 'active'
      : entitlements.hadBody
        ? 'expired'
        : 'locked';
    set({ cachedAccess: access, cachedAddon: addon });
    if (entitlements.body || entitlements.hadBody) set({ bodyTrialUsed: true });
    void repository()
      .then(async (r) => {
        await r.saveCachedAccess(access);
        await r.saveCachedAddon(addon);
      })
      .catch(() => undefined);
  };

  return {
    status: 'idle',
    entitlements: NO_ENTITLEMENTS,
    subscriptions: [],
    tierPackages: [],
    gymPackages: [],
    bodyPackages: [],
    bodyTrialUsed: null,
    prices: {},
    cachedAccess: null,
    cachedAddon: null,
    devGym: false,
    devBody: false,
    devTraining: false,

    async init(userId) {
      set({ status: 'loading' });
      if (get().cachedAccess === null) {
        const cached = await repository()
          .then((r) => r.getCachedAccess())
          .catch(() => null);
        set({ cachedAccess: cached });
      }
      if (get().cachedAddon === null) {
        const cached = await repository()
          .then((r) => r.getCachedAddon())
          .catch(() => null);
        set({ cachedAddon: cached });
      }
      // Once per account: the server remembers every Body trial, whichever device or store.
      void repository()
        .then((r) => r.bodyTrialUsed(userId))
        .then((used) => {
          if (used !== null) set((s) => ({ bodyTrialUsed: s.bodyTrialUsed === true || used }));
        })
        .catch(() => undefined);
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
          billing.loadOfferings().catch(() => ({ tiers: [], gym: [], body: [], prices: {} })),
        ]);
        set({
          tierPackages: offerings.tiers,
          gymPackages: offerings.gym,
          bodyPackages: offerings.body,
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

    async buyBody(packageId) {
      const billing = await client();
      // Unknown counts as used: a second free trial is worse than a paid start the user confirms.
      const result = await billing.purchase(packageId, {
        withoutTrial: get().bodyTrialUsed !== false,
      });
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
    setDevBody: (devBody) => set({ devBody: __DEV__ && devBody }),
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

export type AddonEntitlement = 'body_nutrition';

function bodyGuard(s: BillingState, flags: Partial<RemoteFlags>): AddonGuard {
  return addonGuardOf(
    addonStateOf({
      flag: remoteFlagOn(flags, 'addon_body_nutrition'),
      status: s.status,
      entitlements: s.entitlements,
      subscription: bodySubscriptionOf(s.subscriptions),
      granted: personalBuild || s.devBody,
      cached: s.cachedAddon,
    }),
  );
}

/**
 * The central guard of the Body add-on (CLAUDE.md "Add-on rules"): every add-on screen, card and
 * every engine call that needs add-on data asks this hook – never the entitlement directly. The
 * remote flag `addon_body_nutrition` comes first (off = hidden), then RevenueCat; a personal or
 * development grant counts as active. The server checks the same rules again (RLS).
 */
export function useEntitlement(_entitlement: AddonEntitlement): AddonGuard {
  const flags = useRemoteFlagsStore((s) => s.flags);
  const state = useBillingStore((s) => bodyGuard(s, flags).state);
  return addonGuardOf(state);
}

/** Outside React (queries, mutations): the same guard from the current store state. */
export function addonGuardNow(_entitlement: AddonEntitlement): AddonGuard {
  return bodyGuard(useBillingStore.getState(), useRemoteFlagsStore.getState().flags);
}
