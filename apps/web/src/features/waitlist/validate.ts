export type WaitlistError = 'invalidEmail' | 'consentRequired' | 'unavailable';

export type WaitlistState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; error: WaitlistError; email: string; consent: boolean };

export type ParsedWaitlistForm =
  | { ok: true; email: string; isBot: boolean }
  | { ok: false; error: Exclude<WaitlistError, 'unavailable'>; email: string; consent: boolean };

/** Same shape as the database check: something@something.tld, max 254 characters. */
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Name of the hidden honeypot input; real visitors never fill it. */
export const HONEYPOT_FIELD = 'company';

export function parseWaitlistForm(formData: FormData): ParsedWaitlistForm {
  const raw = formData.get('email');
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const consent = formData.get('consent') === 'on';
  if (email.length > 254 || !EMAIL.test(email)) {
    return { ok: false, error: 'invalidEmail', email, consent };
  }
  if (!consent) return { ok: false, error: 'consentRequired', email, consent };
  const honeypot = formData.get(HONEYPOT_FIELD);
  return { ok: true, email, isBot: typeof honeypot === 'string' && honeypot !== '' };
}
