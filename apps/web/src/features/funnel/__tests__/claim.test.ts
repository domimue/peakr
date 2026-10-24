import type { SupabaseClient, User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { claimFunnel } from '../claim';
import { fakeSupabase, type Call } from './fake-supabase';
import { ANSWERS } from './fixtures';

vi.mock('server-only', () => ({}));

const stripe = {
  subscriptions: {
    cancel: vi.fn(),
    update: vi.fn(),
    retrieve: vi.fn(async () => ({
      items: { data: [{ price: { unit_amount: 5900, currency: 'chf', product: 'prod_1' } }] },
    })),
  },
};
vi.mock('@/lib/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stripe')>()),
  stripeClient: () => stripe,
}));
const sendStripeSubscription = vi.fn();
const setPriceAttributes = vi.fn();
vi.mock('@/lib/revenuecat', () => ({
  sendStripeSubscription: (...a: unknown[]) => sendStripeSubscription(...a),
  setPriceAttributes: (...a: unknown[]) => setPriceAttributes(...a),
}));

const ANON = '6f1c2a4e-1b2c-4d5e-8f90-123456789abc';
const ACCOUNT = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const account = { id: ACCOUNT, is_anonymous: false, email: 'ann@example.com' } as User;

const checkout = (patch: object = {}) => ({
  session_id: 'cs_test_1',
  user_id: ANON,
  email: 'ann@example.com',
  subscription_id: 'sub_1',
  status: 'complete',
  claimed_at: null,
  cancelled_reason: null,
  ...patch,
});
const quizRow = {
  answers: ANSWERS,
  step_id: 'disclaimer',
  finished: true,
  quiz_date: null,
  email: null,
  email_consent_text: null,
  email_consent_at: null,
};

function setup(opts: { checkoutRow?: object; subscribed?: boolean; hasPlan?: boolean } = {}) {
  const row = checkout(opts.checkoutRow);
  let moved = false;
  const fake = fakeSupabase({
    anonymous: [ANON],
    'web_checkouts:select': (call: Call) => ({
      data: call.filters.some(([m]) => m === 'in') ? [row] : row,
      error: null,
    }),
    // The quiz is the anonymous user's until it was moved to the account.
    'quiz_sessions:select': (call: Call) => ({
      data: call.filters.some(([, , v]) => v === ANON || (moved && v === ACCOUNT)) ? quizRow : null,
      error: null,
    }),
    'quiz_sessions:upsert': () => {
      moved = true;
      return { data: null, error: null };
    },
    'rpc:has_entitlement': { data: opts.subscribed ?? false, error: null },
    'plans:select': { data: opts.hasPlan ? [{ id: 'p1' }] : [], error: null },
  });
  return { ...fake, db: fake.client as unknown as SupabaseClient };
}

const ops = (calls: Call[], table: string, op: string) =>
  calls.filter((c) => c.table === table && c.op === op);

beforeEach(() => vi.clearAllMocks());

describe('claimFunnel', () => {
  it('moves answers, subscription and plan to a new account (email matches, other device)', async () => {
    const { db, calls, client } = setup();
    const outcome = await claimFunnel(db, account, { sessionId: 'cs_test_1', cookieUserId: null });

    expect(outcome).toEqual({ purchase: true, keptPlan: false, cancelled: false });
    expect(ops(calls, 'quiz_sessions', 'upsert')[0]?.payload).toMatchObject({
      user_id: ACCOUNT,
      finished: true,
    });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', {
      metadata: { app_user_id: ACCOUNT },
    });
    expect(sendStripeSubscription).toHaveBeenCalledWith(ACCOUNT, 'sub_1');
    expect(setPriceAttributes).toHaveBeenCalledWith(ACCOUNT, 'CHF 59.00', 'prod_1');
    expect(ops(calls, 'web_checkouts', 'update')[0]?.payload).toMatchObject({ user_id: ACCOUNT });
    const plan = ops(calls, 'plans', 'insert')[0]?.payload as { user_id: string; weeks: unknown[] };
    expect(plan.user_id).toBe(ACCOUNT);
    expect(plan.weeks.length).toBeGreaterThan(0);
    expect(ops(calls, 'workouts', 'insert').length).toBeGreaterThan(0);
    expect(client.auth.admin.deleteUser).toHaveBeenCalledWith(ANON);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('refuses a checkout of another email without the funnel cookie', async () => {
    const { db, calls } = setup({ checkoutRow: { email: 'someone@else.com' } });
    const outcome = await claimFunnel(db, account, { sessionId: 'cs_test_1', cookieUserId: null });
    expect(outcome.error).toBe('notYours');
    expect(ops(calls, 'web_checkouts', 'update')).toHaveLength(0);
    expect(sendStripeSubscription).not.toHaveBeenCalled();
  });

  it('accepts another checkout email when this browser ran the funnel (cookie)', async () => {
    const { db } = setup({ checkoutRow: { email: 'someone@else.com' } });
    const outcome = await claimFunnel(db, account, { sessionId: 'cs_test_1', cookieUserId: ANON });
    expect(outcome.purchase).toBe(true);
  });

  it('cancels the new trial when the account already has a subscription and keeps its plan', async () => {
    const { db, calls } = setup({ subscribed: true, hasPlan: true });
    const outcome = await claimFunnel(db, account, { sessionId: 'cs_test_1', cookieUserId: ANON });
    expect(outcome).toEqual({ purchase: true, keptPlan: true, cancelled: true });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1');
    expect(sendStripeSubscription).not.toHaveBeenCalled();
    expect(ops(calls, 'web_checkouts', 'update')[0]?.payload).toMatchObject({
      cancelled_reason: 'already_subscribed',
    });
    expect(ops(calls, 'plans', 'insert')).toHaveLength(0);
  });

  it('never merges a user that is not anonymous', async () => {
    const { db, calls, client } = setup();
    client.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: ANON, is_anonymous: false } },
      error: null,
    } as never);
    const outcome = await claimFunnel(db, account, { cookieUserId: ANON });
    expect(outcome.purchase).toBe(false);
    expect(ops(calls, 'quiz_sessions', 'upsert')).toHaveLength(0);
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('claims a purchase the account made itself, without cancelling it', async () => {
    const { db, calls } = setup({ checkoutRow: { user_id: ACCOUNT }, subscribed: true });
    const outcome = await claimFunnel(db, account, { sessionId: 'cs_test_1', cookieUserId: null });
    expect(outcome).toMatchObject({ purchase: true, cancelled: false });
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(sendStripeSubscription).toHaveBeenCalledWith(ACCOUNT, 'sub_1');
    // The account's own quiz (none in this fixture) – no plan without finished answers.
    expect(ops(calls, 'plans', 'insert')).toHaveLength(0);
  });

  it('does nothing on a second run', async () => {
    const { db, calls } = setup({
      checkoutRow: { user_id: ACCOUNT, claimed_at: '2026-10-24T10:00:00Z' },
    });
    const outcome = await claimFunnel(db, account, { sessionId: 'cs_test_1', cookieUserId: null });
    expect(outcome).toEqual({ purchase: false, keptPlan: false, cancelled: false });
    expect(ops(calls, 'web_checkouts', 'update')).toHaveLength(0);
    expect(sendStripeSubscription).not.toHaveBeenCalled();
  });
});
