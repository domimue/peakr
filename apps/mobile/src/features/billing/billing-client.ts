import { Platform } from 'react-native';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

import { GYM_OFFERING, periodOf, type BillingPeriod } from './model';

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
  priceString: string;
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

/** Prices of every product in every offering, for the subscription screen. */
export async function loadOfferings(): Promise<{
  gym: PackageSummary[];
  prices: Record<string, string>;
}> {
  const offerings = await Purchases.getOfferings();
  packages.clear();
  const prices: Record<string, string> = {};
  for (const offering of Object.values(offerings.all)) {
    for (const pkg of offering.availablePackages) {
      prices[pkg.product.identifier] = pkg.product.priceString;
      if (offering.identifier === GYM_OFFERING) packages.set(pkg.identifier, pkg);
    }
  }
  const gym = [...packages.values()]
    .map((pkg) => ({
      id: pkg.identifier,
      productId: pkg.product.identifier,
      period: periodOf(pkg.product.identifier) ?? periodOf(pkg.identifier),
      priceString: pkg.product.priceString,
      trialDays: trialDaysOf(pkg),
    }))
    .sort((a, b) => (a.period === 'monthly' ? -1 : 0) - (b.period === 'monthly' ? -1 : 0));
  return { gym, prices };
}

export type PurchaseResult = 'purchased' | 'cancelled' | 'error';

export async function purchase(packageId: string): Promise<PurchaseResult> {
  const pkg = packages.get(packageId);
  if (!pkg) return 'error';
  try {
    await Purchases.purchasePackage(pkg);
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
