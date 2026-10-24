/**
 * "Create your account" reminder (CLAUDE.md "Web funnel flow", Phase 10b): someone paid on the
 * website but never created their account, so the plan is waiting with nobody to open it. One
 * email, a while after the checkout, with a link back to the success page where the account is
 * created with the checkout email. Pure selection and texts; `functions/checkout-reminders` sends.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Wait this long after the checkout (the success page is usually done within minutes). */
export const REMIND_AFTER_MS = HOUR_MS;
/** Older checkouts are not reminded any more (the trial is long over). */
export const REMIND_UNTIL_MS = 14 * 24 * HOUR_MS;

export interface CheckoutRow {
  session_id: string;
  email: string | null;
  status: string;
  claimed_at: string | null;
  reminded_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
}

export function isDue(row: CheckoutRow, now: Date): boolean {
  if (row.status !== 'complete' || row.claimed_at || row.reminded_at || row.cancelled_reason) {
    return false;
  }
  if (!row.email) return false;
  const age = now.getTime() - new Date(row.created_at).getTime();
  return age >= REMIND_AFTER_MS && age <= REMIND_UNTIL_MS;
}

/** Back to the success page of this checkout; it sends the sign-in link to the checkout email. */
export function accountLink(siteUrl: string, sessionId: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/checkout/success?session_id=${encodeURIComponent(sessionId)}`;
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function checkoutReminderTexts(link: string): {
  subject: string;
  text: string;
  html: string;
} {
  const lead =
    'Thanks for starting your Peakr trial! Your training plan is ready, but your account is not set up yet – so the app cannot show it to you.';
  const how =
    'Create your account with the email you used at checkout. It takes a minute, then log in to the app and your plan is there.';
  return {
    subject: 'Your Peakr plan is waiting – create your account',
    text: `${lead}\n\n${how}\n\n${link}\n\nPeakr`,
    html:
      `<p>${escape(lead)}</p><p>${escape(how)}</p>` +
      `<p><a href="${escape(link)}">Create my account</a></p><p>Peakr</p>`,
  };
}
