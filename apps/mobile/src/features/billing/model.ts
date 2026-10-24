/**
 * Entitlements and subscriptions as the app sees them (CLAUDE.md "Monetisation"). RevenueCat is
 * the single source; this file maps its customer info to two independent things: the training tier
 * (`training` / `plus`) and the Gym add-on (`gym`). Pure, so it is unit-tested without the SDK.
 */

export const ENTITLEMENTS = ['training', 'plus', 'gym'] as const;
export type EntitlementId = (typeof ENTITLEMENTS)[number];

/** What a subscription row on the subscription screen is about. */
export type SubscriptionKind = 'tier' | 'gym';

export type BillingPeriod = 'monthly' | 'yearly';

export type SubscriptionStore = 'play_store' | 'app_store' | 'stripe' | 'other';

/**
 * Store product ids (create exactly these, see docs/gym-addon-setup.md).
 * Google Play: one subscription per product with base plans `monthly` and `yearly`
 * (RevenueCat reports them as `<subscription>:<base plan>`).
 * App Store: one product per period; the add-on has its own subscription group.
 */
export const PRODUCTS = {
  /** The two tiers share one subscription group on the App Store (upgrade/downgrade inside it). */
  training: {
    play: 'peakr_training',
    appStore: { monthly: 'peakr_training_monthly', yearly: 'peakr_training_yearly' },
  },
  plus: {
    play: 'peakr_plus',
    appStore: { monthly: 'peakr_plus_monthly', yearly: 'peakr_plus_yearly' },
  },
  gym: {
    play: 'peakr_gym',
    appStore: { monthly: 'peakr_gym_monthly', yearly: 'peakr_gym_yearly' },
  },
} as const;

/** RevenueCat offering that holds the add-on packages (the tiers live in `default`). */
export const GYM_OFFERING = 'gym';
export const TIER_OFFERING = 'default';

export type TierKey = 'training' | 'plus';

/** Training + Nutrition is shown but not purchasable until the nutrition part ships. */
export const PURCHASABLE_TIERS: readonly TierKey[] = ['training'];

/** Which tier a store product belongs to (product ids contain the tier name). */
export function tierOf(productId: string): TierKey | null {
  const id = productId.toLowerCase();
  if (id.includes('plus')) return 'plus';
  if (id.includes('training')) return 'training';
  return null;
}

export interface ActiveSubscription {
  kind: SubscriptionKind;
  entitlement: EntitlementId;
  productId: string;
  period: BillingPeriod | null;
  store: SubscriptionStore;
  isTrial: boolean;
  /** The subscription renews (false once cancelled: access runs to `expiresAt`). */
  willRenew: boolean;
  /** Next billing date, or the end of the trial / paid period when it does not renew. */
  expiresAt: string | null;
  /** Store-specific page to change or cancel exactly this subscription. */
  managementUrl: string | null;
  /** Localised price from the store ("CHF 7.90"), when known. */
  priceString: string | null;
}

export interface Entitlements {
  /** Training tier (`plus` includes `training`). */
  tier: 'none' | 'training' | 'plus';
  gym: boolean;
  /** `training` was active once and has lapsed (cancelled and expired, or refunded). */
  hadTraining: boolean;
}

export const NO_ENTITLEMENTS: Entitlements = { tier: 'none', gym: false, hadTraining: false };

/** The slice of RevenueCat's `CustomerInfo` we read (structural, so tests need no SDK). */
export interface CustomerInfoLike {
  entitlements: {
    active: Record<
      string,
      {
        productIdentifier: string;
        store: string;
        periodType: string;
        willRenew: boolean;
        expirationDate: string | null;
        /** Google Play base plan (`monthly` / `yearly`); null on the App Store. */
        productPlanIdentifier?: string | null;
      }
    >;
    /** Active and expired entitlements. */
    all?: Record<string, unknown>;
  };
  managementURL: string | null;
  subscriptionsByProductIdentifier?: Record<string, { managementURL: string | null }>;
}

export function periodOf(productId: string): BillingPeriod | null {
  const id = productId.toLowerCase();
  if (/(year|annual)/.test(id)) return 'yearly';
  if (/month/.test(id)) return 'monthly';
  return null;
}

function storeOf(store: string): SubscriptionStore {
  switch (store) {
    case 'PLAY_STORE':
      return 'play_store';
    case 'APP_STORE':
    case 'MAC_APP_STORE':
      return 'app_store';
    case 'STRIPE':
    case 'RC_BILLING':
      return 'stripe';
    default:
      return 'other';
  }
}

export function entitlementsOf(info: CustomerInfoLike): Entitlements {
  const active = info.entitlements.active;
  const tier = active.plus ? 'plus' : active.training ? 'training' : 'none';
  const all = info.entitlements.all ?? {};
  return {
    tier,
    gym: Boolean(active.gym),
    hadTraining: tier === 'none' && Boolean(all.training ?? all.plus),
  };
}

/**
 * One row per active subscription: the tier and the add-on side by side. `plus` wins over
 * `training` when both entitlements are active (the Plus product grants both).
 */
export function subscriptionsOf(
  info: CustomerInfoLike,
  priceByProduct: Readonly<Record<string, string>> = {},
): ActiveSubscription[] {
  const active = info.entitlements.active;
  const ids: EntitlementId[] = [];
  if (active.plus) ids.push('plus');
  else if (active.training) ids.push('training');
  if (active.gym) ids.push('gym');
  return ids.map((entitlement) => {
    const e = active[entitlement];
    if (!e) throw new Error(`entitlement ${entitlement} vanished`);
    const store = storeOf(e.store);
    return {
      kind: entitlement === 'gym' ? 'gym' : 'tier',
      entitlement,
      productId: e.productIdentifier,
      period: periodOf(e.productPlanIdentifier ?? e.productIdentifier),
      store,
      isTrial: e.periodType.toUpperCase() === 'TRIAL',
      willRenew: e.willRenew,
      expiresAt: e.expirationDate,
      managementUrl:
        info.subscriptionsByProductIdentifier?.[e.productIdentifier]?.managementURL ??
        info.managementURL,
      priceString: priceByProduct[e.productIdentifier] ?? null,
    };
  });
}

/**
 * What the app may show (CLAUDE.md "Monetisation", no free tier):
 * - `full` – `training` is active (paid or in the trial);
 * - `readOnly` – it was active once and has ended: the plan and history stay visible, nothing can
 *   be edited, regenerated, paused, exported or connected;
 * - `preview` – never subscribed: quiz, forecast, week 1 and the paywall only;
 * - `pending` – billing has not answered yet (render nothing rather than a wrong paywall).
 */
export type Access = 'full' | 'readOnly' | 'preview' | 'pending';

export type BillingStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export function accessOf(input: {
  status: BillingStatus;
  entitlements: Entitlements;
  /** Development build: no RevenueCat key or not loaded yet means full access. */
  devBuild: boolean;
  /** Last level the store reported on this device, for starts where the SDK fails. */
  cached: Access | null;
}): Access {
  const { status, entitlements, devBuild, cached } = input;
  if (status === 'ready') {
    if (entitlements.tier !== 'none') return 'full';
    return entitlements.hadTraining ? 'readOnly' : 'preview';
  }
  if (devBuild) return 'full';
  if (status === 'error' || status === 'unavailable') return cached ?? 'preview';
  return cached ?? 'pending';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** First charge after a free trial that starts now ("Free until Oct 31"). */
export function firstChargeDate(now: Date, trialDays: number): Date {
  return new Date(now.getTime() + trialDays * DAY_MS);
}

/**
 * Store product to replace when switching tier or period through the store's change flow
 * (Google Play: the subscription id without the base plan). Null when there is nothing to replace
 * in this store – no tier yet, a web (Stripe) subscription, or already on exactly this plan.
 */
export function changeFrom(
  current: ActiveSubscription | undefined,
  target: { productId: string; period: BillingPeriod | null },
): string | null {
  if (!current || current.kind !== 'tier' || current.store === 'stripe') return null;
  const base = (id: string) => id.split(':')[0] ?? id;
  const sameTier = tierOf(current.productId) === tierOf(target.productId);
  if (sameTier && current.period === target.period) return null;
  return base(current.productId);
}
