/**
 * Stripe REST API with the secret key STRIPE_SECRET_KEY – only what the Edge Functions need (the
 * website has its own Stripe client). Never logs the key.
 */

const API = 'https://api.stripe.com/v1';

/**
 * Cancels a website subscription at once (account deletion: there is no store to cancel it in,
 * and nobody could sign in to the customer portal afterwards). Already cancelled or unknown
 * subscriptions count as done. Without a key nothing happens (Stripe not set up yet).
 */
export async function cancelStripeSubscription(subscriptionId: string): Promise<void> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) {
    console.warn('STRIPE_SECRET_KEY missing – website subscription not cancelled');
    return;
  }
  const response = await fetch(`${API}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${key}` },
  });
  if (response.ok || response.status === 404) return;
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: string };
  } | null;
  // Cancelling a subscription that already ended.
  if (body?.error?.code === 'resource_missing') return;
  throw new Error(`Stripe cancellation failed: ${response.status}`);
}
