'use server';

import { redirect } from 'next/navigation';

import { adminClient } from '@/lib/supabase/server';
import { PURCHASABLE_TIERS, type Period, type Tier } from '@/lib/stripe';

import { createCheckout, paywallState } from './checkout';
import { getVisitor, loadQuiz } from './visitor';

/** Paywall → Stripe Checkout (hosted page). Re-checks everything the paywall showed. */
export async function startCheckout(formData: FormData): Promise<void> {
  const tier = formData.get('tier') as Tier;
  const period = formData.get('period');
  if (!PURCHASABLE_TIERS.includes(tier) || (period !== 'monthly' && period !== 'yearly')) {
    redirect('/quiz/paywall');
  }
  const visitor = await getVisitor();
  const quiz = visitor ? await loadQuiz(visitor) : null;
  if (!visitor || !quiz?.finished) redirect('/quiz');
  const admin = adminClient();
  if (!admin) redirect('/quiz/paywall?error=unavailable');

  let url: string;
  try {
    const state = await paywallState(admin, visitor, quiz);
    if (state.kind === 'subscribed') url = '/account';
    else url = await createCheckout(admin, visitor, quiz, tier, period as Period, state.withTrial);
  } catch (e) {
    console.error('Starting the checkout failed', String(e));
    url = '/quiz/paywall?error=unavailable';
  }
  redirect(url);
}
