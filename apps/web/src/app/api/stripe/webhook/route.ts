import type { NextRequest } from 'next/server';

import { completeCheckout } from '@/features/funnel/checkout';
import { stripeClient } from '@/lib/stripe';
import { adminClient } from '@/lib/supabase/server';

/**
 * Stripe → website: a finished or expired Checkout Session. Records it in `web_checkouts` and
 * hands the subscription to RevenueCat (`completeCheckout`, idempotent – the success page does the
 * same, whichever comes first). Renewals, cancellations and portal changes reach RevenueCat through
 * its own Stripe integration, not through here.
 *
 * Endpoint in Stripe: https://<site>/api/stripe/webhook, events `checkout.session.completed` and
 * `checkout.session.expired`, signing secret in STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const admin = adminClient();
  if (!stripe || !secret || !admin) return new Response('Not configured', { status: 503 });

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, secret);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.expired') {
    try {
      await completeCheckout(admin, event.data.object.id);
    } catch (e) {
      // Stripe retries on a non-2xx answer.
      console.error('Stripe webhook failed', event.type, String(e));
      return new Response('Failed', { status: 500 });
    }
  }
  return new Response('ok');
}
