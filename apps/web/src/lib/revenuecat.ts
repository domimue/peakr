import 'server-only';

/**
 * RevenueCat from the website server (CLAUDE.md "Billing": RevenueCat is the single source of
 * entitlements). A Stripe subscription is handed to RevenueCat for a Supabase user id; RevenueCat
 * then grants `training` (Stripe products are attached to the entitlement in RevenueCat), the app
 * unlocks on its own, and the `revenuecat-webhook` Edge Function mirrors it into `entitlements`.
 *
 * - REVENUECAT_STRIPE_PUBLIC_KEY: the public API key of the Stripe app in RevenueCat (`strp_…`).
 * - REVENUECAT_SECRET_KEY: secret key (v1), for the subscriber attributes.
 */

const API = 'https://api.revenuecat.com/v1';

/**
 * Sends the Stripe subscription to RevenueCat under `appUserId`. Sending it again with another id
 * moves it there (project setting "Transfer to new App User ID") – that is how a purchase made by
 * the anonymous quiz user reaches the account.
 */
export async function sendStripeSubscription(appUserId: string, subscriptionId: string) {
  const key = process.env.REVENUECAT_STRIPE_PUBLIC_KEY;
  if (!key) throw new Error('Missing REVENUECAT_STRIPE_PUBLIC_KEY');
  const response = await fetch(`${API}/receipts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Platform': 'stripe',
    },
    body: JSON.stringify({ app_user_id: appUserId, fetch_token: subscriptionId }),
  });
  if (!response.ok) throw new Error(`RevenueCat receipt failed: ${response.status}`);
}

/**
 * The price the trial reminder names (`peakr_price`, `peakr_product` – the same attributes the
 * app sets before a store purchase). Best effort: without it the reminder names no amount.
 */
export async function setPriceAttributes(appUserId: string, price: string, productId: string) {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) return;
  const response = await fetch(`${API}/subscribers/${encodeURIComponent(appUserId)}/attributes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attributes: { peakr_price: { value: price }, peakr_product: { value: productId } },
    }),
  });
  if (!response.ok) console.warn('RevenueCat attributes failed', response.status);
}
