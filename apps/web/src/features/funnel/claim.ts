import 'server-only';

import type { QuizAnswers } from '@peakr/quiz';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { sendStripeSubscription, setPriceAttributes } from '@/lib/revenuecat';
import { formatMoney, stripeClient } from '@/lib/stripe';

import { funnelPlan, funnelToday } from './plan';
import { planRows } from './plan-rows';

/**
 * Attaching the funnel to the account (CLAUDE.md "Web funnel flow" step 5). The quiz and the
 * checkout ran under an anonymous Supabase user; after the visitor signed in (new or existing
 * account) this moves everything to the account:
 *
 * 1. the quiz answers (`quiz_sessions`),
 * 2. the checkout (`web_checkouts`) and the subscription – sent to RevenueCat again under the
 *    account (transfer) – unless the account already had an active subscription from the app: then
 *    the new web trial is cancelled at once, so nobody pays twice,
 * 3. the plan, written as the rows the app syncs – the first time a checkout is claimed, and not
 *    over the plan of an account that was already subscribed,
 * 4. and deletes the anonymous user.
 *
 * Proof that the anonymous user is this visitor's: the signed funnel cookie of this browser, or –
 * for the checkout link from the email on another device – the account's verified email being the
 * checkout email. Only anonymous users are ever merged. Idempotent: a second run finds nothing to
 * move and changes nothing.
 */

export interface ClaimOutcome {
  /** A checkout now belongs to the account. */
  purchase: boolean;
  /** The account already had a plan and kept it. */
  keptPlan: boolean;
  /** The new web subscription was cancelled because the account already had one. */
  cancelled: boolean;
  error?: 'notYours';
}

interface CheckoutRow {
  session_id: string;
  user_id: string | null;
  email: string | null;
  subscription_id: string | null;
  status: string;
  claimed_at: string | null;
  cancelled_reason: string | null;
}

interface QuizRow {
  answers: QuizAnswers;
  step_id: string | null;
  finished: boolean;
  quiz_date: string | null;
  email: string | null;
  email_consent_text: string | null;
  email_consent_at: string | null;
}

const CHECKOUT_COLUMNS =
  'session_id, user_id, email, subscription_id, status, claimed_at, cancelled_reason';
const QUIZ_COLUMNS =
  'answers, step_id, finished, quiz_date, email, email_consent_text, email_consent_at';

const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

async function isAnonymousUser(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  return !error && data.user?.is_anonymous === true;
}

/** An active `training` from a store (or another web purchase) before this claim. */
async function alreadySubscribed(admin: SupabaseClient, accountId: string): Promise<boolean> {
  const { data, error } = await admin.rpc('has_entitlement', { uid: accountId, name: 'training' });
  if (error) throw new Error(`Entitlement check failed: ${error.message}`);
  return data === true;
}

async function moveQuiz(admin: SupabaseClient, from: string, to: string): Promise<void> {
  const [{ data: source }, { data: target }] = await Promise.all([
    admin.from('quiz_sessions').select(QUIZ_COLUMNS).eq('user_id', from).maybeSingle<QuizRow>(),
    admin.from('quiz_sessions').select(QUIZ_COLUMNS).eq('user_id', to).maybeSingle<QuizRow>(),
  ]);
  if (!source) return;
  // The quiz the visitor just did wins over an older one of the account – unless that one is
  // finished and this one is not.
  if (!target || source.finished || !target.finished) {
    const { error } = await admin
      .from('quiz_sessions')
      .upsert({ user_id: to, ...source }, { onConflict: 'user_id' });
    if (error) throw new Error(`Moving the quiz failed: ${error.message}`);
  }
  await admin.from('quiz_sessions').delete().eq('user_id', from);
}

/** The subscription's current price, for the trial reminder of the new owner. */
async function priceAttributes(subscriptionId: string, owner: string): Promise<void> {
  const stripe = stripeClient();
  if (!stripe) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const price = subscription.items.data[0]?.price;
  if (price?.unit_amount == null) return;
  const product = typeof price.product === 'string' ? price.product : price.product.id;
  await setPriceAttributes(owner, formatMoney(price.unit_amount, price.currency), product);
}

async function claimCheckout(
  admin: SupabaseClient,
  row: CheckoutRow,
  accountId: string,
  cancel: boolean,
): Promise<'claimed' | 'cancelled'> {
  const stripe = stripeClient();
  if (row.subscription_id && stripe) {
    if (cancel) {
      // Still in the free trial: cancelling now charges nothing.
      await stripe.subscriptions.cancel(row.subscription_id);
    } else {
      await stripe.subscriptions.update(row.subscription_id, {
        metadata: { app_user_id: accountId },
      });
      await sendStripeSubscription(accountId, row.subscription_id);
      await priceAttributes(row.subscription_id, accountId).catch((e: unknown) =>
        console.warn('Price attributes failed', String(e)),
      );
    }
  }
  const { error } = await admin
    .from('web_checkouts')
    .update({
      user_id: accountId,
      claimed_at: new Date().toISOString(),
      ...(cancel ? { cancelled_reason: 'already_subscribed' } : {}),
    })
    .eq('session_id', row.session_id);
  if (error) throw new Error(`Claiming the checkout failed: ${error.message}`);
  return cancel ? 'cancelled' : 'claimed';
}

async function writePlan(admin: SupabaseClient, accountId: string): Promise<boolean> {
  const { data: quiz } = await admin
    .from('quiz_sessions')
    .select(QUIZ_COLUMNS)
    .eq('user_id', accountId)
    .maybeSingle<QuizRow>();
  if (!quiz?.finished) return false;
  const result = funnelPlan(quiz.answers, funnelToday(quiz.quiz_date));
  if (!result) return false;
  const rows = planRows(accountId, result);
  // A new quiz result replaces the old plan, like in the app (soft delete, so devices learn it).
  const { error: deleteError } = await admin
    .from('plans')
    .update({ deleted: true, updated_at: rows.plan.created_at })
    .eq('user_id', accountId)
    .eq('deleted', false);
  if (deleteError) throw new Error(`Replacing the plan failed: ${deleteError.message}`);
  const { error } = await admin.from('plans').insert(rows.plan);
  if (error) throw new Error(`Writing the plan failed: ${error.message}`);
  for (let i = 0; i < rows.workouts.length; i += 200) {
    const { error: wError } = await admin.from('workouts').insert(rows.workouts.slice(i, i + 200));
    if (wError) throw new Error(`Writing the workouts failed: ${wError.message}`);
  }
  return true;
}

async function hasPlan(admin: SupabaseClient, accountId: string): Promise<boolean> {
  const { data } = await admin
    .from('plans')
    .select('id')
    .eq('user_id', accountId)
    .eq('deleted', false)
    .limit(1);
  return (data ?? []).length > 0;
}

export async function claimFunnel(
  admin: SupabaseClient,
  account: User,
  { sessionId, cookieUserId }: { sessionId?: string; cookieUserId: string | null },
): Promise<ClaimOutcome> {
  const outcome: ClaimOutcome = { purchase: false, keptPlan: false, cancelled: false };
  if (account.is_anonymous) return outcome;

  // Anonymous users whose funnel this account may take over.
  const sources = new Set<string>();
  if (cookieUserId && cookieUserId !== account.id) sources.add(cookieUserId);

  let linked: CheckoutRow | null = null;
  if (sessionId) {
    const { data } = await admin
      .from('web_checkouts')
      .select(CHECKOUT_COLUMNS)
      .eq('session_id', sessionId)
      .maybeSingle<CheckoutRow>();
    linked = data ?? null;
    if (linked?.user_id && linked.user_id !== account.id) {
      if (linked.user_id === cookieUserId || sameEmail(linked.email, account.email)) {
        sources.add(linked.user_id);
      } else {
        return { ...outcome, error: 'notYours' };
      }
    }
  }
  for (const id of sources) if (!(await isAnonymousUser(admin, id))) sources.delete(id);

  // Checkouts to claim: those of the anonymous users, plus one the account bought itself.
  const ids = [...sources];
  const { data: rows } = ids.length
    ? await admin
        .from('web_checkouts')
        .select(CHECKOUT_COLUMNS)
        .in('user_id', ids)
        .returns<CheckoutRow[]>()
    : { data: [] as CheckoutRow[] };
  const toClaim = (rows ?? []).filter((r) => r.status === 'complete');
  if (
    linked &&
    linked.user_id === account.id &&
    linked.status === 'complete' &&
    !linked.claimed_at
  ) {
    toClaim.push(linked);
  }

  // Decided before anything moves: did the account already have an active subscription?
  const ownPurchase = (r: CheckoutRow) => r.user_id === account.id;
  const cancel =
    toClaim.some((r) => !ownPurchase(r) && !r.cancelled_reason) &&
    (await alreadySubscribed(admin, account.id));

  for (const id of ids) await moveQuiz(admin, id, account.id);
  let claimedAny = false;
  for (const row of toClaim) {
    if (row.cancelled_reason) continue;
    const result = await claimCheckout(admin, row, account.id, cancel && !ownPurchase(row));
    outcome.purchase = true;
    if (result === 'cancelled') outcome.cancelled = true;
    else claimedAny = true;
  }
  // Checkouts that never completed just change owner.
  if (ids.length) {
    await admin.from('web_checkouts').update({ user_id: account.id }).in('user_id', ids);
  }

  if (claimedAny) {
    await writePlan(admin, account.id);
  } else if (outcome.cancelled) {
    // Already subscribed: their plan stays; only an account without any plan gets the new one.
    outcome.keptPlan = await hasPlan(admin, account.id);
    if (!outcome.keptPlan) await writePlan(admin, account.id);
  }

  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && error.status !== 404)
      console.warn('Deleting the anonymous user failed', error.code);
  }
  return outcome;
}
