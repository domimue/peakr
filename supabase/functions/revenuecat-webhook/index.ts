/**
 * RevenueCat webhook (CLAUDE.md "Monetisation"): keeps the entitlement status server-side.
 *
 *   POST /revenuecat-webhook  (Authorization: the value set in RevenueCat → Integrations →
 *        Webhooks, stored as REVENUECAT_WEBHOOK_AUTH)  → { ok: true, users }
 *
 * Every event (INITIAL_PURCHASE, RENEWAL, CANCELLATION, UNCANCELLATION, EXPIRATION,
 * PRODUCT_CHANGE, BILLING_ISSUE, TRANSFER, …) only names the users it concerns; their current
 * state is read from the RevenueCat REST API and replaces the stored rows. Store purchases in the
 * app and Stripe purchases on the website arrive the same way, keyed by the Supabase user id.
 * Answers 200 quickly; a failed lookup answers 500 so RevenueCat retries the event.
 *
 * `verify_jwt = false`: RevenueCat sends its own Authorization header, not a Supabase JWT.
 */

import { sameSecret, usersOfEvent, type WebhookBody } from '../_shared/billing/revenuecat.ts';
import { refreshUser } from '../_shared/billing/store.ts';
import { adminClient, json } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'not_found' }, 404);
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';
  if (!sameSecret(req.headers.get('Authorization'), expected)) {
    return json({ error: 'unauthorized' }, 401);
  }
  let body: WebhookBody;
  try {
    body = (await req.json()) as WebhookBody;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const users = usersOfEvent(body);
  const admin = adminClient();
  try {
    for (const userId of users) {
      // Only Supabase users: an unknown id (e.g. a sandbox test user) is skipped.
      const { data } = await admin.auth.admin.getUserById(userId);
      if (!data?.user) continue;
      await refreshUser(admin, userId);
    }
    console.log(
      'RevenueCat event',
      body.event?.type ?? 'unknown',
      body.event?.id ?? '',
      users.length,
    );
    return json({ ok: true, users: users.length });
  } catch (error) {
    console.error('revenuecat-webhook failed', body.event?.type ?? 'unknown', String(error));
    return json({ error: 'internal' }, 500);
  }
});
