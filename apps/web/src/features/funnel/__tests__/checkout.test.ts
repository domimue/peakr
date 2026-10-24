import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { completeCheckout, createCheckout, paywallState } from '../checkout';
import type { QuizProgress, Visitor } from '../visitor';
import { fakeSupabase } from './fake-supabase';

vi.mock('server-only', () => ({}));

const stripe = {
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
};
vi.mock('@/lib/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stripe')>()),
  stripeClient: () => stripe,
  priceId: (tier: string, period: string) => `price_${tier}_${period}`,
}));

const sendStripeSubscription = vi.fn();
const setPriceAttributes = vi.fn();
vi.mock('@/lib/revenuecat', () => ({
  sendStripeSubscription: (...a: unknown[]) => sendStripeSubscription(...a),
  setPriceAttributes: (...a: unknown[]) => setPriceAttributes(...a),
}));

const ANON = '6f1c2a4e-1b2c-4d5e-8f90-123456789abc';
const ACCOUNT = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const anonVisitor = { client: {}, user: { id: ANON, is_anonymous: true } } as unknown as Visitor;
const accountVisitor = {
  client: {},
  user: { id: ACCOUNT, is_anonymous: false, email: 'ann@example.com' },
} as unknown as Visitor;
const quiz = (email: string | null = null): QuizProgress => ({
  answers: {},
  stepId: null,
  finished: true,
  quizDate: '2026-10-24',
  email,
});
const admin = (results: Record<string, unknown>) => {
  const fake = fakeSupabase(results);
  return { ...fake, db: fake.client as unknown as SupabaseClient };
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = 'https://peakr.test';
});

describe('paywallState', () => {
  it('offers nothing to an account that already has training', async () => {
    const { db } = admin({ 'rpc:has_entitlement': { data: true, error: null } });
    expect(await paywallState(db, accountVisitor, quiz())).toEqual({ kind: 'subscribed' });
  });

  it('suggests logging in when the quiz email has an account, and no second trial', async () => {
    const { db } = admin({
      'rpc:funnel_email_status': {
        data: { account_id: ACCOUNT, has_training: false, had_trial: true },
        error: null,
      },
    });
    expect(await paywallState(db, anonVisitor, quiz('ann@example.com'))).toEqual({
      kind: 'open',
      withTrial: false,
      existingAccountEmail: 'ann@example.com',
    });
  });

  it('gives an anonymous visitor without email the trial', async () => {
    const { db } = admin({});
    expect(await paywallState(db, anonVisitor, quiz())).toEqual({
      kind: 'open',
      withTrial: true,
      existingAccountEmail: null,
    });
  });
});

describe('createCheckout', () => {
  it('creates a subscription checkout with the 7-day trial, card upfront, for the quiz user', async () => {
    stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_test_1', url: 'https://stripe/x' });
    const { db, calls } = admin({});
    const url = await createCheckout(
      db,
      anonVisitor,
      quiz('ann@example.com'),
      'training',
      'yearly',
      true,
    );
    expect(url).toBe('https://stripe/x');
    const params = stripe.checkout.sessions.create.mock.calls[0]![0];
    expect(params).toMatchObject({
      mode: 'subscription',
      line_items: [{ price: 'price_training_yearly', quantity: 1 }],
      client_reference_id: ANON,
      customer_email: 'ann@example.com',
      payment_method_collection: 'always',
      subscription_data: {
        metadata: { app_user_id: ANON },
        trial_period_days: 7,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      },
      success_url: 'https://peakr.test/checkout/success?session_id={CHECKOUT_SESSION_ID}',
    });
    expect(
      calls.find((c) => c.table === 'web_checkouts' && c.op === 'insert')?.payload,
    ).toMatchObject({
      session_id: 'cs_test_1',
      user_id: ANON,
      with_trial: true,
      tier: 'training',
      period: 'yearly',
    });
  });

  it('starts without trial when it was used, and reuses the account’s Stripe customer', async () => {
    stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_test_2', url: 'https://stripe/y' });
    const { db } = admin({
      'web_checkouts:select': { data: { customer_id: 'cus_1' }, error: null },
    });
    await createCheckout(db, accountVisitor, quiz(), 'training', 'monthly', false);
    const params = stripe.checkout.sessions.create.mock.calls[0]![0];
    expect(params.customer).toBe('cus_1');
    expect(params.customer_email).toBeUndefined();
    expect(params.subscription_data.trial_period_days).toBeUndefined();
  });
});

describe('completeCheckout', () => {
  const session = (patch: object = {}) => ({
    id: 'cs_test_1',
    status: 'complete',
    mode: 'subscription',
    metadata: { app_user_id: ANON, tier: 'training', period: 'yearly' },
    client_reference_id: ANON,
    customer: 'cus_1',
    customer_details: { email: 'Ann@Example.com' },
    subscription: { id: 'sub_1', trial_end: 1_793_000_000 },
    line_items: { data: [{ price: { unit_amount: 5900, currency: 'chf', product: 'prod_1' } }] },
    ...patch,
  });
  const row = (patch: object = {}) => ({
    data: {
      session_id: 'cs_test_1',
      user_id: ANON,
      email: null,
      with_trial: true,
      trial_end: null,
      status: 'open',
      claimed_at: null,
      cancelled_reason: null,
      ...patch,
    },
    error: null,
  });

  it('rejects ids that are not checkout sessions', async () => {
    const { db } = admin({});
    expect(await completeCheckout(db, 'nope')).toEqual({ status: 'invalid' });
  });

  it('reports a checkout that is still open', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue(session({ status: 'open' }));
    const { db } = admin({});
    expect(await completeCheckout(db, 'cs_test_1')).toEqual({ status: 'open' });
  });

  it('records the purchase and hands it to RevenueCat for the current owner', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue(session());
    const { db, calls } = admin({ 'web_checkouts:select': row({ user_id: ACCOUNT }) });
    const result = await completeCheckout(db, 'cs_test_1');
    expect(result).toMatchObject({
      status: 'complete',
      ownerId: ACCOUNT,
      email: 'ann@example.com',
    });
    expect(calls.find((c) => c.op === 'update')?.payload).toMatchObject({
      status: 'complete',
      subscription_id: 'sub_1',
      customer_id: 'cus_1',
    });
    expect(sendStripeSubscription).toHaveBeenCalledWith(ACCOUNT, 'sub_1');
    expect(setPriceAttributes).toHaveBeenCalledWith(ACCOUNT, 'CHF 59.00', 'prod_1');
  });

  it('rebuilds a missing row from the session metadata', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue(session());
    const { db, calls } = admin({});
    await completeCheckout(db, 'cs_test_1');
    expect(calls.find((c) => c.op === 'upsert')?.payload).toMatchObject({
      session_id: 'cs_test_1',
      user_id: ANON,
      tier: 'training',
      period: 'yearly',
      with_trial: true,
    });
    expect(sendStripeSubscription).toHaveBeenCalledWith(ANON, 'sub_1');
  });

  it('does not hand a cancelled checkout to RevenueCat again', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue(session());
    const { db } = admin({
      'web_checkouts:select': row({ cancelled_reason: 'already_subscribed' }),
    });
    await completeCheckout(db, 'cs_test_1');
    expect(sendStripeSubscription).not.toHaveBeenCalled();
  });
});
