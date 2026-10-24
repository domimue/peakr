import 'server-only';

import Stripe from 'stripe';

/**
 * Stripe on the website server (secret key STRIPE_SECRET_KEY, never in the browser). Prices are
 * configured in Stripe and referenced by id, so the paywall always shows what Stripe charges.
 * Returns null when Stripe is not configured.
 */

export type Tier = 'training' | 'plus';
export type Period = 'monthly' | 'yearly';

/** Tiers that can be bought on the website now; Plus is "coming soon" (CLAUDE.md "Monetisation"). */
export const PURCHASABLE_TIERS: readonly Tier[] = ['training'];

let client: Stripe | null | undefined;

export function stripeClient(): Stripe | null {
  if (client === undefined) {
    const key = process.env.STRIPE_SECRET_KEY;
    client = key ? new Stripe(key, { appInfo: { name: 'Peakr website' } }) : null;
  }
  return client;
}

export function priceId(tier: Tier, period: Period): string | null {
  const env = {
    training: {
      monthly: process.env.STRIPE_PRICE_TRAINING_MONTHLY,
      yearly: process.env.STRIPE_PRICE_TRAINING_YEARLY,
    },
    plus: {
      monthly: process.env.STRIPE_PRICE_PLUS_MONTHLY,
      yearly: process.env.STRIPE_PRICE_PLUS_YEARLY,
    },
  } as const;
  return env[tier][period] || null;
}

export interface PriceInfo {
  id: string;
  productId: string;
  /** Minor units (cents). */
  amount: number;
  currency: string;
  /** "CHF 59.00" */
  formatted: string;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: currency.toUpperCase(),
    currencyDisplay: 'code',
  })
    .format(amount / 100)
    .replace(/ /g, ' ');
}

export function priceInfo(price: Stripe.Price): PriceInfo | null {
  if (price.unit_amount === null) return null;
  return {
    id: price.id,
    productId: typeof price.product === 'string' ? price.product : price.product.id,
    amount: price.unit_amount,
    currency: price.currency,
    formatted: formatMoney(price.unit_amount, price.currency),
  };
}

/** Monthly and yearly price of the Training tier, or null when Stripe or a price is missing. */
export async function trainingPrices(): Promise<Record<Period, PriceInfo> | null> {
  const stripe = stripeClient();
  const monthly = priceId('training', 'monthly');
  const yearly = priceId('training', 'yearly');
  if (!stripe || !monthly || !yearly) return null;
  try {
    const [m, y] = await Promise.all([
      stripe.prices.retrieve(monthly),
      stripe.prices.retrieve(yearly),
    ]);
    const mi = priceInfo(m);
    const yi = priceInfo(y);
    return mi && yi ? { monthly: mi, yearly: yi } : null;
  } catch (e) {
    console.error('Loading Stripe prices failed', (e as { code?: string }).code ?? String(e));
    return null;
  }
}
