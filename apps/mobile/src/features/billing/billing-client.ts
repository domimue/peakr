import { Platform } from 'react-native';
import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  PRORATION_MODE,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

import {
  BODY_OFFERING,
  GYM_OFFERING,
  periodOf,
  TIER_OFFERING,
  tierOf,
  type BillingPeriod,
  type TierKey,
} from './model';

/**
 * RevenueCat wrapper (`react-native-purchases`): the only file that touches the SDK. Public SDK
 * keys come from the environment (they are not secrets); without a key billing is unavailable and
 * the app behaves as "no add-on" (development builds can use the dev grant in the store).
 */

const KEYS = {
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
} as const;

export interface PackageSummary {
  /** Package identifier inside the offering. */
  id: string;
  productId: string;
  period: BillingPeriod | null;
  /** Tier of a package in the tier offering; null for the add-ons. */
  tier: TierKey | null;
  priceString: string;
  /** Price as a number in the store currency (for the bundle saving). */
  price?: number;
  /** Free-trial length in days, when the store product has an introductory trial. */
  trialDays: number | null;
}

let configured = false;
const packages = new Map<string, PurchasesPackage>();

export function billingConfigured(): boolean {
  return configured;
}

/** Configures the SDK once and identifies the Supabase user (same id as on the web). */
export async function configureBilling(userId: string | null): Promise<boolean> {
  const apiKey = Platform.OS === 'ios' ? KEYS.ios : KEYS.android;
  if (!apiKey) return false;
  if (!configured) {
    Purchases.configure({ apiKey, appUserID: userId });
    configured = true;
  } else if (userId) {
    await Purchases.logIn(userId);
  } else {
    await Purchases.logOut().catch(() => undefined);
  }
  return true;
}

export function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

export function onCustomerInfo(listener: (info: CustomerInfo) => void): () => void {
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

function trialDaysOf(pkg: PurchasesPackage): number | null {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const unitDays = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 } as const;
  const unit = unitDays[intro.periodUnit as keyof typeof unitDays];
  return unit ? unit * intro.periodNumberOfUnits * intro.cycles : null;
}

/**
 * iOS knows whether this Apple ID already used the trial of a subscription group; Google Play only
 * offers the trial to eligible users in the first place (RevenueCat leaves it out otherwise).
 */
async function ineligibleForTrial(productIds: string[]): Promise<Set<string>> {
  if (Platform.OS !== 'ios' || productIds.length === 0) return new Set();
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
    return new Set(
      Object.entries(result)
        .filter(
          ([, e]) => e.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE,
        )
        .map(([id]) => id),
    );
  } catch {
    return new Set();
  }
}

const byPeriod = (a: PackageSummary, b: PackageSummary) =>
  (a.period === 'monthly' ? -1 : 0) - (b.period === 'monthly' ? -1 : 0);

const OFFERINGS: readonly string[] = [TIER_OFFERING, GYM_OFFERING, BODY_OFFERING];

/**
 * Packages of the tier offering (`default`, with the bundle "Peakr + Body" as `plus`) and the
 * add-on offerings (`gym`, `body`), with store prices and trial length, plus the price of every
 * product for the subscription screen.
 */
export async function loadOfferings(): Promise<{
  tiers: PackageSummary[];
  gym: PackageSummary[];
  body: PackageSummary[];
  prices: Record<string, string>;
}> {
  const offerings = await Purchases.getOfferings();
  packages.clear();
  const prices: Record<string, string> = {};
  const offeringOf = new Map<string, string>();
  for (const offering of Object.values(offerings.all)) {
    for (const pkg of offering.availablePackages) {
      prices[pkg.product.identifier] = pkg.product.priceString;
      if (!OFFERINGS.includes(offering.identifier)) continue;
      const key = `${offering.identifier}:${pkg.identifier}`;
      packages.set(key, pkg);
      offeringOf.set(key, offering.identifier);
    }
  }
  const ineligible = await ineligibleForTrial(
    [...packages.values()].map((pkg) => pkg.product.identifier),
  );
  const summaries = [...packages.entries()].map(([key, pkg]) => ({
    offering: offeringOf.get(key),
    summary: {
      id: key,
      productId: pkg.product.identifier,
      period: periodOf(pkg.product.identifier) ?? periodOf(pkg.identifier),
      tier: offeringOf.get(key) === TIER_OFFERING ? tierOf(pkg.product.identifier) : null,
      priceString: pkg.product.priceString,
      price: pkg.product.price,
      trialDays: ineligible.has(pkg.product.identifier) ? null : trialDaysOf(pkg),
    } satisfies PackageSummary,
  }));
  const of = (offering: string) =>
    summaries
      .filter((s) => s.offering === offering)
      .map((s) => s.summary)
      .sort(byPeriod);
  return { tiers: of(TIER_OFFERING), gym: of(GYM_OFFERING), body: of(BODY_OFFERING), prices };
}

export type PurchaseResult = 'purchased' | 'cancelled' | 'error';

export interface PurchaseOptions {
  /**
   * Google Play: the subscription to replace (tier or period change). Upgrades take effect now
   * with the remaining time credited, downgrades at the next renewal. The App Store handles a
   * change inside the subscription group by itself.
   */
  replace?: { productId: string; downgrade: boolean } | null;
  /**
   * The account already used this add-on's trial (once per account, `addon_trials`). Google Play
   * then buys the base plan without the free phase; the App Store decides per Apple ID itself.
   */
  withoutTrial?: boolean;
}

export async function purchase(
  packageId: string,
  options: PurchaseOptions = {},
): Promise<PurchaseResult> {
  const pkg = packages.get(packageId);
  if (!pkg) return 'error';
  try {
    // The trial reminder (one day before the first charge) names the price; the webhook reads it
    // back from these attributes because RevenueCat events of a trial carry a price of 0.
    await Purchases.setAttributes({
      peakr_price: pkg.product.priceString,
      peakr_product: pkg.product.identifier,
    }).catch(() => undefined);
    const replace = Platform.OS === 'android' ? options.replace : null;
    const basePlan =
      Platform.OS === 'android' && options.withoutTrial
        ? pkg.product.subscriptionOptions?.find((o) => o.isBasePlan)
        : undefined;
    if (basePlan) {
      await Purchases.purchaseSubscriptionOption(basePlan);
      return 'purchased';
    }
    await Purchases.purchasePackage(
      pkg,
      null,
      replace
        ? {
            oldProductIdentifier: replace.productId,
            prorationMode: replace.downgrade
              ? PRORATION_MODE.DEFERRED
              : PRORATION_MODE.IMMEDIATE_WITH_TIME_PRORATION,
          }
        : null,
    );
    return 'purchased';
  } catch (error) {
    const e = error as { code?: unknown; userCancelled?: boolean };
    return e.userCancelled || e.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
      ? 'cancelled'
      : 'error';
  }
}

export async function restore(): Promise<boolean> {
  try {
    await Purchases.restorePurchases();
    return true;
  } catch {
    return false;
  }
}
