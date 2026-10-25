import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

import { sendStripeSubscription, setPriceAttributes } from '@/lib/revenuecat';
import { siteUrl } from '@/lib/site';
import { formatMoney, priceId, stripeClient, type Period, type Tier } from '@/lib/stripe';

import { sendCheckoutConfirmation } from './confirmation-email';
import type { QuizProgress, Visitor } from './visitor';

/**
 * Stripe Checkout for the website funnel (CLAUDE.md "Web funnel flow" step 4): monthly or yearly,
 * the 7-day trial with the card collected upfront (one trial per user), and the hand-over of the
 * subscription to RevenueCat for the Supabase user who bought it. Every checkout is recorded in
 * `web_checkouts` so the account created afterwards can claim it (`claim.ts`).
 */

export const TRIAL_DAYS = 7;

/** When a trial started now converts (Stripe charges at the end of the trial). */
export function trialChargeDate(now: Date = new Date()): string {
  return new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString();
}

export interface EmailStatus {
  accountId: string | null;
  hasTraining: boolean;
  hadTrial: boolean;
}

export async function emailStatus(admin: SupabaseClient, email: string): Promise<EmailStatus> {
  const { data, error } = await admin.rpc('funnel_email_status', { addr: email }).maybeSingle<{
    account_id: string | null;
    has_training: boolean;
    had_trial: boolean;
  }>();
  if (error) throw new Error(`Email status failed: ${error.message}`);
  return {
    accountId: data?.account_id ?? null,
    hasTraining: data?.has_training ?? false,
    hadTrial: data?.had_trial ?? false,
  };
}

export async function hasTraining(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.rpc('has_entitlement', { uid: userId, name: 'training' });
  if (error) throw new Error(`Entitlement check failed: ${error.message}`);
  return data === true;
}

export type PaywallState =
  | { kind: 'subscribed' }
  | {
      kind: 'open';
      withTrial: boolean;
      /** The quiz email belongs to an existing account: suggest logging in first. */
      existingAccountEmail: string | null;
    };

/** What the paywall offers this visitor: the trial (once per user), or nothing to buy. */
export async function paywallState(
  admin: SupabaseClient,
  visitor: Visitor,
  quiz: QuizProgress,
): Promise<PaywallState> {
  if (!visitor.user.is_anonymous) {
    if (await hasTraining(admin, visitor.user.id)) return { kind: 'subscribed' };
    const status = visitor.user.email ? await emailStatus(admin, visitor.user.email) : null;
    return { kind: 'open', withTrial: !status?.hadTrial, existingAccountEmail: null };
  }
  if (!quiz.email) return { kind: 'open', withTrial: true, existingAccountEmail: null };
  const status = await emailStatus(admin, quiz.email);
  return {
    kind: 'open',
    withTrial: !status.hadTrial,
    existingAccountEmail: status.accountId ? quiz.email : null,
  };
}

/** The Stripe customer of an earlier website purchase of this user (portal, one customer each). */
export async function stripeCustomerOf(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from('web_checkouts')
    .select('customer_id')
    .eq('user_id', userId)
    .not('customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ customer_id: string }>();
  return data?.customer_id ?? null;
}

export async function createCheckout(
  admin: SupabaseClient,
  visitor: Visitor,
  quiz: QuizProgress,
  tier: Tier,
  period: Period,
  withTrial: boolean,
): Promise<string> {
  const stripe = stripeClient();
  const price = priceId(tier, period);
  if (!stripe || !price) throw new Error('Stripe is not configured');
  const userId = visitor.user.id;
  const email = visitor.user.is_anonymous ? quiz.email : (visitor.user.email ?? null);
  const customer = visitor.user.is_anonymous ? null : await stripeCustomerOf(admin, userId);
  const site = siteUrl();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    client_reference_id: userId,
    ...(customer ? { customer } : email ? { customer_email: email } : {}),
    metadata: { app_user_id: userId, tier, period },
    subscription_data: {
      metadata: { app_user_id: userId, tier, period },
      ...(withTrial
        ? {
            trial_period_days: TRIAL_DAYS,
            // Card upfront: a trial without a payment method never converts.
            trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
          }
        : {}),
    },
    payment_method_collection: 'always',
    // Terms of service checkbox (needs the terms URL in the Stripe dashboard, see the docs).
    consent_collection: { terms_of_service: 'required' },
    locale: 'en',
    success_url: `${site}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/quiz/paywall`,
  });
  if (!session.url) throw new Error('Stripe returned no checkout URL');

  const { error } = await admin.from('web_checkouts').insert({
    session_id: session.id,
    user_id: userId,
    email,
    customer_id: customer,
    tier,
    period,
    with_trial: withTrial,
  });
  // The success page and the webhook can still record it from the session's metadata.
  if (error) console.error('Recording the checkout failed', error.code);
  return session.url;
}

export type CheckoutResult =
  | { status: 'invalid' }
  | { status: 'open' }
  | { status: 'expired' }
  | {
      status: 'complete';
      sessionId: string;
      ownerId: string | null;
      email: string | null;
      withTrial: boolean;
      trialEnd: string | null;
      claimed: boolean;
      cancelledReason: string | null;
    };

interface CheckoutRow {
  session_id: string;
  user_id: string | null;
  email: string | null;
  with_trial: boolean;
  trial_end: string | null;
  status: string;
  claimed_at: string | null;
  cancelled_reason: string | null;
}

const isTier = (v: unknown): v is Tier => v === 'training' || v === 'plus';
const isPeriod = (v: unknown): v is Period => v === 'monthly' || v === 'yearly';
const idOf = (v: string | { id: string } | null) =>
  v === null ? null : typeof v === 'string' ? v : v.id;

/**
 * Records a finished checkout and hands the subscription to RevenueCat for its current owner (the
 * anonymous quiz user, or the account once it claimed the checkout). Idempotent: the Stripe
 * webhook and the success page both call it.
 */
export async function completeCheckout(
  admin: SupabaseClient,
  sessionId: string,
): Promise<CheckoutResult> {
  const stripe = stripeClient();
  if (!stripe || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { status: 'invalid' };
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'line_items'],
    });
  } catch {
    return { status: 'invalid' };
  }
  if (session.status === 'expired') {
    await admin.from('web_checkouts').update({ status: 'expired' }).eq('session_id', sessionId);
    return { status: 'expired' };
  }
  if (session.status !== 'complete' || session.mode !== 'subscription') return { status: 'open' };

  const subscription = session.subscription as Stripe.Subscription | null;
  const meta = session.metadata ?? {};
  const email = session.customer_details?.email?.toLowerCase() ?? null;
  const trialEnd = subscription?.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;
  const { data: existing } = await admin
    .from('web_checkouts')
    .select(
      'session_id, user_id, email, with_trial, trial_end, status, claimed_at, cancelled_reason',
    )
    .eq('session_id', sessionId)
    .maybeSingle<CheckoutRow>();

  const update = {
    status: 'complete',
    email,
    customer_id: idOf(session.customer as string | { id: string } | null),
    subscription_id: subscription?.id ?? null,
    trial_end: trialEnd,
  };
  let row: CheckoutRow;
  if (existing) {
    const { error } = await admin.from('web_checkouts').update(update).eq('session_id', sessionId);
    if (error) throw new Error(`Updating the checkout failed: ${error.message}`);
    row = { ...existing, ...update };
  } else {
    // The row from `createCheckout` is missing (its insert failed): rebuild it from the session.
    const insert = {
      session_id: sessionId,
      user_id: meta.app_user_id ?? session.client_reference_id,
      tier: isTier(meta.tier) ? meta.tier : 'training',
      period: isPeriod(meta.period) ? meta.period : 'monthly',
      with_trial: trialEnd !== null,
      ...update,
    };
    const { error } = await admin
      .from('web_checkouts')
      .upsert(insert, { onConflict: 'session_id' });
    if (error) throw new Error(`Recording the checkout failed: ${error.message}`);
    row = { ...insert, claimed_at: null, cancelled_reason: null };
  }

  if (row.user_id && subscription && !row.cancelled_reason) {
    await sendStripeSubscription(row.user_id, subscription.id);
    const price = session.line_items?.data[0]?.price;
    if (price?.unit_amount != null) {
      const product = typeof price.product === 'string' ? price.product : price.product.id;
      await setPriceAttributes(
        row.user_id,
        formatMoney(price.unit_amount, price.currency),
        product,
      );
    }
  }

  // Not for a trial that was cancelled at once (the buyer already had a subscription).
  if (!row.cancelled_reason) {
    await sendCheckoutConfirmation(admin, { sessionId, email: row.email, trialEnd: row.trial_end });
  }

  return {
    status: 'complete',
    sessionId,
    ownerId: row.user_id,
    email: row.email,
    withTrial: row.with_trial,
    trialEnd: row.trial_end,
    claimed: row.claimed_at !== null,
    cancelledReason: row.cancelled_reason,
  };
}
