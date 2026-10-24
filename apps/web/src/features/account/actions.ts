'use server';

import { redirect } from 'next/navigation';

import { stripeCustomerOf } from '@/features/funnel/checkout';
import { siteUrl } from '@/lib/site';
import { stripeClient } from '@/lib/stripe';
import { adminClient, currentUser, isAccount, sessionClient } from '@/lib/supabase/server';

/**
 * Stripe customer portal for website subscribers (CLAUDE.md "Store rules": web subscribers manage
 * and cancel via the portal): switch monthly/yearly, update the card, invoices, cancel.
 */
export async function openCustomerPortal(): Promise<void> {
  const user = await currentUser(await sessionClient());
  if (!isAccount(user)) redirect('/login?next=/account');
  const admin = adminClient();
  const stripe = stripeClient();
  let url = '/account?error=portal';
  if (admin && stripe) {
    try {
      const customer = await stripeCustomerOf(admin, user.id);
      if (customer) {
        const session = await stripe.billingPortal.sessions.create({
          customer,
          return_url: `${siteUrl()}/account`,
        });
        url = session.url;
      }
    } catch (e) {
      console.error('Customer portal failed', (e as { code?: string }).code ?? String(e));
    }
  }
  redirect(url);
}
