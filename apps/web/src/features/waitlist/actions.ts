'use server';

import { getSupabase } from '@/lib/supabase';
import { messages } from '@/i18n';

import { parseWaitlistForm, type WaitlistState } from './validate';

/** Postgres unique violation – the email is already on the list. */
const UNIQUE_VIOLATION = '23505';

export async function joinWaitlist(
  _previous: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const parsed = parseWaitlistForm(formData);
  if (!parsed.ok) {
    return { status: 'error', error: parsed.error, email: parsed.email, consent: parsed.consent };
  }
  // Bots get the same answer as people, so the honeypot is not revealed.
  if (parsed.isBot) return { status: 'success' };

  const supabase = getSupabase();
  if (!supabase) {
    console.error('Waitlist: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set');
    return { status: 'error', error: 'unavailable', email: parsed.email, consent: true };
  }

  const { error } = await supabase.from('waitlist').insert({
    email: parsed.email,
    consent_text: messages.waitlist.consent,
    locale: 'en',
  });
  // An address that is already on the list is a success too – and we don't reveal who signed up.
  if (error && error.code !== UNIQUE_VIOLATION) {
    console.error('Waitlist insert failed', error.code, error.message);
    return { status: 'error', error: 'unavailable', email: parsed.email, consent: true };
  }
  return { status: 'success' };
}
