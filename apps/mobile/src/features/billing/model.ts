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
  gym: {
    play: 'peakr_gym',
    appStore: { monthly: 'peakr_gym_monthly', yearly: 'peakr_gym_yearly' },
  },
} as const;

/** RevenueCat offering that holds the add-on packages (the tiers live in `default`). */
export const GYM_OFFERING = 'gym';

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
}

export const NO_ENTITLEMENTS: Entitlements = { tier: 'none', gym: false };

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
      }
    >;
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
  return { tier, gym: Boolean(active.gym) };
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
      period: periodOf(e.productIdentifier),
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
