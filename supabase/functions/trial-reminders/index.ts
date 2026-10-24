/**
 * Trial-ending reminder (CLAUDE.md "Monetisation"): one push and one email one day before a trial
 * converts, with the charge date, the amount and a direct link to cancel.
 *
 *   POST /trial-reminders  (x-cron-secret: CRON_SECRET)  → { due, pushed, emailed }
 *
 * Called hourly by pg_cron (see the migration). Reads trials from `entitlements` (kept current by
 * `revenuecat-webhook`), skips those already in `trial_reminders`, and records each one it sends,
 * so a trial is reminded exactly once even when a run fails half-way and the next hour retries.
 * Without an email provider (RESEND_API_KEY + EMAIL_FROM) only the push goes out.
 *
 * `verify_jwt = false` because the cron call carries a secret instead of a JWT.
 */

import { dueReminders, reminderKey, reminderTexts } from '../_shared/billing/reminder.ts';
import type { EntitlementRow } from '../_shared/billing/revenuecat.ts';
import { emailProvider } from '../_shared/email.ts';
import { pushToUser } from '../_shared/push.ts';
import { adminClient, json } from '../_shared/supabase.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'not_found' }, 404);
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }
  const admin = adminClient();
  const now = new Date();
  const siteUrl = Deno.env.get('SITE_URL') ?? null;
  try {
    const { data: rows, error } = await admin
      .from('entitlements')
      .select(
        'user_id, entitlement, product_id, store, period_type, will_renew, expires_at, price_string, management_url',
      )
      .eq('period_type', 'trial')
      .eq('will_renew', true)
      .gt('expires_at', now.toISOString())
      .lte('expires_at', new Date(now.getTime() + DAY_MS).toISOString());
    if (error) throw error;
    const candidates = (rows ?? []) as EntitlementRow[];
    if (candidates.length === 0) return json({ due: 0, pushed: 0, emailed: 0 });

    const { data: sentRows, error: sentError } = await admin
      .from('trial_reminders')
      .select('user_id, product_id, charge_at')
      .in('user_id', [...new Set(candidates.map((r) => r.user_id))]);
    if (sentError) throw sentError;
    const sent = new Set(
      (sentRows ?? []).map((r) =>
        reminderKey({ userId: r.user_id, productId: r.product_id, chargeAt: r.charge_at }),
      ),
    );

    const email = emailProvider();
    let pushed = 0;
    let emailed = 0;
    const due = dueReminders(candidates, sent, now);
    for (const reminder of due) {
      // Claim the reminder first: a second run never sends it again.
      const { error: claimError } = await admin.from('trial_reminders').insert({
        user_id: reminder.userId,
        product_id: reminder.productId,
        charge_at: reminder.chargeAt,
      });
      if (claimError) {
        if (claimError.code === '23505') continue;
        throw claimError;
      }
      const texts = reminderTexts(reminder, siteUrl);
      let didPush = false;
      let didEmail = false;
      try {
        await pushToUser(admin, reminder.userId, { type: 'trial_ending' }, texts.push, {
          alwaysAlert: true,
        });
        didPush = true;
        pushed++;
      } catch (e) {
        console.warn('Trial reminder push failed', String(e));
      }
      if (email) {
        const { data } = await admin.auth.admin.getUserById(reminder.userId);
        const address = data?.user?.email;
        if (address) {
          try {
            await email.send({ to: address, ...texts.email });
            didEmail = true;
            emailed++;
          } catch (e) {
            console.warn('Trial reminder email failed', String(e));
          }
        }
      }
      await admin
        .from('trial_reminders')
        .update({ pushed: didPush, emailed: didEmail })
        .eq('user_id', reminder.userId)
        .eq('product_id', reminder.productId)
        .eq('charge_at', reminder.chargeAt);
    }
    return json({ due: due.length, pushed, emailed });
  } catch (error) {
    console.error('trial-reminders failed', String(error));
    return json({ error: 'internal' }, 500);
  }
});
