/**
 * Entitlements and subscriptions as the app sees them (CLAUDE.md "Monetisation"). RevenueCat is
 * the single source; this file maps its customer info to independent things: the training tier
 * (`training` / `plus`), the Gym add-on (`gym`) and the Body add-on (`body_nutrition`, CLAUDE.md
 * "Add-on rules"). `plus` is the bundle "Peakr + Body": training and Body in one subscription.
 * Pure, so it is unit-tested without the SDK.
 */

export const ENTITLEMENTS = ['training', 'plus', 'gym', 'body_nutrition'] as const;
export type EntitlementId = (typeof ENTITLEMENTS)[number];

/** What a subscription row on the subscription screen is about. */
export type SubscriptionKind = 'tier' | 'gym' | 'body';

export type BillingPeriod = 'monthly' | 'yearly';

export type SubscriptionStore = 'play_store' | 'app_store' | 'stripe' | 'other';

/**
 * Store product ids (create exactly these, see docs/gym-addon-setup.md).
 * Google Play: one subscription per product with base plans `monthly` and `yearly`
 * (RevenueCat reports them as `<subscription>:<base plan>`).
 * App Store: one product per period; the add-on has its own subscription group.
 */
export const PRODUCTS = {
  /**
   * The two tiers share one subscription group on the App Store (upgrade/downgrade inside it).
   * `plus` is the bundle "Peakr + Body" (grants `training`, `plus` and `body_nutrition`).
   */
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
  /** Body add-on: its own subscription group / product, like the Gym add-on (14-day trial). */
  body: {
    play: 'peakr_body',
    appStore: { monthly: 'peakr_body_monthly', yearly: 'peakr_body_yearly' },
  },
} as const;

/** RevenueCat offering that holds the add-on packages (the tiers live in `default`). */
export const GYM_OFFERING = 'gym';
export const BODY_OFFERING = 'body';
export const TIER_OFFERING = 'default';

export type TierKey = 'training' | 'plus';

/**
 * The bundle "Peakr + Body" is shown as "coming soon" until the Body add-on is switched on
 * (remote flag `addon_body_nutrition`).
 */
export function purchasableTiers(bodyEnabled: boolean): readonly TierKey[] {
  return bodyEnabled ? ['training', 'plus'] : ['training'];
}

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
  /** Body add-on active, on its own or through the bundle. */
  body: boolean;
  /** Body was active once and has lapsed: its data stays readable, new entries are locked. */
  hadBody: boolean;
}

export const NO_ENTITLEMENTS: Entitlements = {
  tier: 'none',
  gym: false,
  hadTraining: false,
  body: false,
  hadBody: false,
};

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
  const body = Boolean(active.body_nutrition ?? active.plus);
  return {
    tier,
    gym: Boolean(active.gym),
    hadTraining: tier === 'none' && Boolean(all.training ?? all.plus),
    body,
    hadBody: !body && Boolean(all.body_nutrition ?? all.plus),
  };
}

/**
 * One row per active subscription: the tier and the add-ons side by side. `plus` wins over
 * `training` when both entitlements are active (the bundle grants both); Body through the bundle
 * is part of the tier row, not a row of its own.
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
  const body = active.body_nutrition;
  if (body && body.productIdentifier !== active.plus?.productIdentifier) ids.push('body_nutrition');
  return ids.map((entitlement) => {
    const e = active[entitlement];
    if (!e) throw new Error(`entitlement ${entitlement} vanished`);
    const store = storeOf(e.store);
    return {
      kind: entitlement === 'gym' ? 'gym' : entitlement === 'body_nutrition' ? 'body' : 'tier',
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

/**
 * Where the Body add-on stands for this user (CLAUDE.md "Add-on rules"):
 * - `hidden` – the remote flag `addon_body_nutrition` is off: no tab, no card, no offer;
 * - `pending` – billing has not answered yet;
 * - `locked` – never had it: previews and the way to the paywall;
 * - `trial` / `active` – everything; `cancelled` – still everything until the paid period ends;
 * - `expired` – had it: history stays readable and exportable, new entries are locked.
 */
export type AddonState =
  'hidden' | 'pending' | 'locked' | 'trial' | 'active' | 'cancelled' | 'expired';

/** Last add-on level the store reported on this device, for starts where the SDK fails. */
export type CachedAddon = 'active' | 'expired' | 'locked';

export function addonStateOf(input: {
  flag: boolean;
  status: BillingStatus;
  entitlements: Entitlements;
  /** The subscription that grants Body (the add-on itself or the bundle), when active. */
  subscription: ActiveSubscription | undefined;
  /** Development / personal build grant. */
  granted: boolean;
  cached: CachedAddon | null;
}): AddonState {
  const { flag, status, entitlements, subscription, granted, cached } = input;
  if (!flag) return 'hidden';
  if (granted) return 'active';
  if (status === 'ready') {
    if (entitlements.body) {
      if (subscription?.isTrial && subscription.willRenew) return 'trial';
      if (subscription && !subscription.willRenew) return 'cancelled';
      return 'active';
    }
    return entitlements.hadBody ? 'expired' : 'locked';
  }
  if (status === 'error' || status === 'unavailable') return cached ?? 'locked';
  return cached ?? 'pending';
}

/** What a state allows: real screens (`read`), new entries and edits (`write`). */
export interface AddonGuard {
  state: AddonState;
  /** The add-on is visible at all (tab, card, offers). */
  visible: boolean;
  /** History and screens with real data. */
  canRead: boolean;
  /** New entries, edits and engine calls that produce add-on values. */
  canWrite: boolean;
  isTrial: boolean;
}

export function addonGuardOf(state: AddonState): AddonGuard {
  const canWrite = state === 'trial' || state === 'active' || state === 'cancelled';
  return {
    state,
    visible: state !== 'hidden',
    canRead: canWrite || state === 'expired',
    canWrite,
    isTrial: state === 'trial',
  };
}

/** The subscription that grants Body: the add-on row, else the bundle. */
export function bodySubscriptionOf(
  subscriptions: readonly ActiveSubscription[],
): ActiveSubscription | undefined {
  return (
    subscriptions.find((s) => s.kind === 'body') ??
    subscriptions.find((s) => s.kind === 'tier' && s.entitlement === 'plus')
  );
}

/**
 * How much the bundle saves against training plus the Body add-on bought separately, in whole
 * percent (same period, same currency – the store prices). Null when it saves nothing or a price
 * is unknown.
 */
export function bundleSavingPct(training: number, body: number, bundle: number): number | null {
  if (!(training > 0 && body > 0 && bundle > 0)) return null;
  const pct = Math.floor(((training + body - bundle) / (training + body)) * 100);
  return pct > 0 ? pct : null;
}

/** Days of the Body add-on's free trial (the store product carries it; this is what we set up). */
export const BODY_TRIAL_DAYS = 14;

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

/** Android application id (Play's cancel page needs it next to the subscription id). */
const ANDROID_PACKAGE = 'com.peakr.app';

/**
 * The store page that cancels exactly this subscription. RevenueCat's management URL first; the
 * stores' documented pages as a fallback. Web (Stripe) subscriptions are cancelled on the website.
 */
export function cancelUrlOf(subscription: ActiveSubscription): string | null {
  if (subscription.store === 'stripe') return null;
  if (subscription.managementUrl) return subscription.managementUrl;
  if (subscription.store === 'play_store') {
    const sku = subscription.productId.split(':')[0] ?? subscription.productId;
    return `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(sku)}&package=${ANDROID_PACKAGE}`;
  }
  if (subscription.store === 'app_store') return 'https://apps.apple.com/account/subscriptions';
  return null;
}
