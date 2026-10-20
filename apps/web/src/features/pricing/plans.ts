import { interpolate, messages } from '@/i18n';

export type TierKey = 'training' | 'plus';
export type BillingPeriod = 'monthly' | 'yearly';

export interface Tier {
  key: TierKey;
  prices: Record<BillingPeriod, number>;
  /** Not purchasable yet – shown with a "coming soon" badge. */
  comingSoon: boolean;
}

/** Target prices from CLAUDE.md "Monetisation"; the store and Stripe products must match. */
export const TIERS: readonly Tier[] = [
  { key: 'training', prices: { monthly: 7.9, yearly: 59 }, comingSoon: false },
  { key: 'plus', prices: { monthly: 11.9, yearly: 89 }, comingSoon: true },
];

/** "CHF 7.90" – whole amounts without decimals ("CHF 59"). */
export function formatPrice(amount: number): string {
  const t = messages.pricing;
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return interpolate(t.price, { currency: t.currency, amount: value });
}

/** Saving of the yearly price against twelve monthly payments, in whole percent. */
export function yearlySavingPercent(prices: Record<BillingPeriod, number>): number {
  return Math.round((1 - prices.yearly / (prices.monthly * 12)) * 100);
}
