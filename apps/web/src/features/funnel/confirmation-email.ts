import type { SupabaseClient } from '@supabase/supabase-js';

import { openAppUrl } from '@/features/get-app/app-links';
import { emailProvider, type EmailProvider } from '@/lib/email';
import { siteUrl } from '@/lib/site';

import { formatInstant } from './format';

/**
 * The checkout confirmation email (Phase 10d): sent once per completed website checkout, to the
 * checkout email. It carries the same "Open Peakr" app link as the website – the app opens if it
 * is installed, otherwise the link's page leads to the store – plus the way to create the
 * account, which is what actually brings the plan into the app.
 */

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function confirmationTexts(input: {
  openUrl: string;
  accountUrl: string;
  manageUrl: string;
  trialEnd: string | null;
}): { subject: string; text: string; html: string } {
  const lead = input.trialEnd
    ? `Your 7-day Peakr trial has started. Nothing is charged before ${formatInstant(input.trialEnd)} – you can cancel any time before then.`
    : 'Your Peakr subscription is active.';
  const steps = [
    {
      text: 'Create your account with this email address, if you have not done it yet.',
      label: 'Create my account',
      url: input.accountUrl,
    },
    {
      text: 'Get the app on your phone. On a phone with Peakr installed, this link opens it.',
      label: 'Open Peakr',
      url: input.openUrl,
    },
    {
      text: 'Log in with the same email, Google or Apple account – your plan is there.',
      label: null,
      url: null,
    },
  ];
  const manage = `Manage or cancel your subscription: ${input.manageUrl}`;
  const text = [
    lead,
    ...steps.map((s, i) => `${i + 1}. ${s.text}${s.url ? `\n   ${s.url}` : ''}`),
    manage,
    'Peakr',
  ].join('\n\n');
  const html =
    `<p>${escape(lead)}</p><ol>` +
    steps
      .map(
        (s) =>
          `<li><p>${escape(s.text)}</p>` +
          (s.url && s.label ? `<p><a href="${escape(s.url)}">${escape(s.label)}</a></p>` : '') +
          '</li>',
      )
      .join('') +
    `</ol><p>Manage or cancel your subscription: <a href="${escape(input.manageUrl)}">${escape(input.manageUrl)}</a></p><p>Peakr</p>`;
  return {
    subject: input.trialEnd
      ? 'Your Peakr trial has started – get the app'
      : 'Welcome to Peakr – get the app',
    text,
    html,
  };
}

/**
 * Sends the confirmation once: `confirmed_at` is claimed first, so the Stripe webhook and the
 * success page (which both complete the checkout) cannot both send. A failed send releases the
 * claim for the next attempt. Never throws – the checkout itself is already recorded.
 */
export async function sendCheckoutConfirmation(
  admin: SupabaseClient,
  checkout: { sessionId: string; email: string | null; trialEnd: string | null },
  provider: EmailProvider | null = emailProvider(),
): Promise<boolean> {
  if (!provider || !checkout.email) return false;
  try {
    const { data: claimed, error } = await admin
      .from('web_checkouts')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('session_id', checkout.sessionId)
      .is('confirmed_at', null)
      .select('session_id');
    if (error) throw new Error(error.message);
    if (!claimed || claimed.length === 0) return false;
    const site = siteUrl();
    const texts = confirmationTexts({
      openUrl: openAppUrl('email'),
      accountUrl: `${site}/checkout/success?session_id=${encodeURIComponent(checkout.sessionId)}`,
      manageUrl: `${site}/account`,
      trialEnd: checkout.trialEnd,
    });
    try {
      await provider.send({ to: checkout.email, ...texts });
      return true;
    } catch (e) {
      await admin
        .from('web_checkouts')
        .update({ confirmed_at: null })
        .eq('session_id', checkout.sessionId);
      throw e;
    }
  } catch (e) {
    console.error('Checkout confirmation email failed', String(e));
    return false;
  }
}
