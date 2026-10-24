/**
 * "Create your account" reminder for website buyers who never created their account (Phase 10b).
 *
 *   POST /checkout-reminders  (x-cron-secret: CRON_SECRET)  → { due, emailed }
 *
 * Called hourly by pg_cron (see the web funnel migration). Each completed, unclaimed checkout gets
 * one email with a link back to the website's success page. `reminded_at` is claimed before the
 * email goes out, so a checkout is reminded at most once even when runs overlap. Without an email
 * provider (RESEND_API_KEY + EMAIL_FROM) or SITE_URL nothing is sent.
 *
 * `verify_jwt = false` because the cron call carries a secret instead of a JWT.
 */

import {
  accountLink,
  checkoutReminderTexts,
  isDue,
  REMIND_AFTER_MS,
  REMIND_UNTIL_MS,
  type CheckoutRow,
} from '../_shared/billing/checkout-reminder.ts';
import { emailProvider } from '../_shared/email.ts';
import { adminClient, json } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'not_found' }, 404);
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }
  const email = emailProvider();
  const siteUrl = Deno.env.get('SITE_URL');
  if (!email || !siteUrl) return json({ due: 0, emailed: 0, skipped: 'not_configured' });

  const admin = adminClient();
  const now = new Date();
  try {
    const { data, error } = await admin
      .from('web_checkouts')
      .select('session_id, email, status, claimed_at, reminded_at, cancelled_reason, created_at')
      .eq('status', 'complete')
      .is('claimed_at', null)
      .is('reminded_at', null)
      .lte('created_at', new Date(now.getTime() - REMIND_AFTER_MS).toISOString())
      .gte('created_at', new Date(now.getTime() - REMIND_UNTIL_MS).toISOString())
      .limit(200);
    if (error) throw error;
    const due = ((data ?? []) as CheckoutRow[]).filter((row) => isDue(row, now));
    let emailed = 0;
    for (const row of due) {
      // Claim first: only the run that sets `reminded_at` sends.
      const { data: claimed, error: claimError } = await admin
        .from('web_checkouts')
        .update({ reminded_at: now.toISOString() })
        .eq('session_id', row.session_id)
        .is('reminded_at', null)
        .is('claimed_at', null)
        .select('session_id');
      if (claimError) throw claimError;
      if (!claimed || claimed.length === 0) continue;
      try {
        const texts = checkoutReminderTexts(accountLink(siteUrl, row.session_id));
        await email.send({ to: row.email as string, ...texts });
        emailed++;
      } catch (e) {
        console.warn('Checkout reminder email failed', String(e));
      }
    }
    return json({ due: due.length, emailed });
  } catch (error) {
    console.error('checkout-reminders failed', String(error));
    return json({ error: 'internal' }, 500);
  }
});
