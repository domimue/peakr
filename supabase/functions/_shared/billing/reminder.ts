import { isActive, type EntitlementRow } from './revenuecat.ts';

/**
 * Trial-ending reminder (CLAUDE.md "Monetisation"): one push and one email one day before a trial
 * converts, with the charge date, the amount and a direct link to cancel. Pure selection and
 * texts; `functions/trial-reminders` sends them. English first, like the app.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Reminder {
  userId: string;
  productId: string;
  /** The first charge (end of the trial). */
  chargeAt: string;
  entitlement: EntitlementRow['entitlement'];
  store: EntitlementRow['store'];
  priceString: string | null;
  managementUrl: string | null;
}

/** Key of a sent reminder: one per trial (user, product, charge date). */
export const reminderKey = (r: { userId: string; productId: string; chargeAt: string }) =>
  `${r.userId}|${r.productId}|${new Date(r.chargeAt).toISOString()}`;

/**
 * Trials that convert within the next 24 hours, still set to renew, not reminded yet. The bundle
 * (`plus`) grants `training`, `plus` and `body_nutrition` with the same product: that is one
 * trial, one reminder, named after the bundle.
 */
export function dueReminders(
  rows: readonly EntitlementRow[],
  sent: ReadonlySet<string>,
  now: Date,
): Reminder[] {
  const due = new Map<string, Reminder>();
  for (const row of rows) {
    if (row.period_type !== 'trial' || !row.will_renew || row.expires_at === null) continue;
    if (!isActive(row, now)) continue;
    if (new Date(row.expires_at).getTime() - now.getTime() > DAY_MS) continue;
    const reminder: Reminder = {
      userId: row.user_id,
      productId: row.product_id,
      chargeAt: row.expires_at,
      entitlement: row.entitlement,
      store: row.store,
      priceString: row.price_string,
      managementUrl: row.management_url,
    };
    const key = reminderKey(reminder);
    if (sent.has(key)) continue;
    const existing = due.get(key);
    // Name the tier the user bought (plus over training).
    if (!existing || row.entitlement === 'plus') due.set(key, reminder);
  }
  return [...due.values()];
}

const PRODUCT_NAMES: Record<Reminder['entitlement'], string> = {
  training: 'Peakr Training',
  plus: 'Peakr + Body',
  gym: 'Peakr Gym',
  body_nutrition: 'Peakr Body',
};

const STORE_NAMES: Record<Reminder['store'], string> = {
  play_store: 'Google Play',
  app_store: 'the App Store',
  stripe: 'your Peakr account on the website',
  other: 'the store you subscribed in',
};

/** Where this trial is cancelled: the store's own page, or the website account page (Stripe). */
export function cancelLink(reminder: Reminder, siteUrl: string | null): string | null {
  if (reminder.store === 'stripe') return siteUrl ? `${siteUrl.replace(/\/+$/, '')}/account` : null;
  if (reminder.managementUrl) return reminder.managementUrl;
  if (reminder.store === 'play_store') {
    const sku = reminder.productId.split(':')[0] ?? reminder.productId;
    return `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(sku)}&package=com.peakr.app`;
  }
  if (reminder.store === 'app_store') return 'https://apps.apple.com/account/subscriptions';
  return null;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "31 October 2026" (UTC; written by hand so Deno and Node format it the same). */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export interface ReminderTexts {
  push: { title: string; body: string };
  email: { subject: string; text: string; html: string };
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function reminderTexts(reminder: Reminder, siteUrl: string | null): ReminderTexts {
  const name = PRODUCT_NAMES[reminder.entitlement];
  const date = formatDate(reminder.chargeAt);
  const amount = reminder.priceString ?? 'the regular price shown in the store';
  const link = cancelLink(reminder, siteUrl);
  const store = STORE_NAMES[reminder.store];
  const charge = `Your free trial of ${name} ends tomorrow. On ${date} you will be charged ${amount}, then it renews automatically.`;
  const cancel = `Not for you? Cancel before then in ${store} and you pay nothing${link ? `: ${link}` : '.'}`;
  return {
    push: {
      title: 'Your free trial ends tomorrow',
      body: `${name}: ${amount} on ${date}. Cancel anytime before then in ${store}.`,
    },
    email: {
      subject: `Your Peakr trial ends tomorrow – ${amount} on ${date}`,
      text: `${charge}\n\n${cancel}\n\nIf you keep it, there is nothing to do.\n\nPeakr`,
      html:
        `<p>${escape(charge)}</p>` +
        `<p>Not for you? Cancel before then in ${escape(store)} and you pay nothing.</p>` +
        (link ? `<p><a href="${escape(link)}">Cancel my subscription</a></p>` : '') +
        `<p>If you keep it, there is nothing to do.</p><p>Peakr</p>`,
    },
  };
}
