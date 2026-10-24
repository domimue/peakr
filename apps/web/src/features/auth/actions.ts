'use server';

import { redirect } from 'next/navigation';

import { claimAfterSignIn } from '@/features/funnel/after-sign-in';
import { sessionClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/site';

import { normalizeEmail, safeNext } from './next-path';

/**
 * Website sign-in (account page, success page, "already have Peakr?"): email magic link with the
 * 6-digit code from the same email as fallback (the link only works in the browser that asked for
 * it), Google and Sign in with Apple – the same methods as the app, the same Supabase account.
 * Every method lands on `/auth/callback` (or verifies the code here) and then on `next`.
 */

export type SignInState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; error: 'invalidEmail' | 'invalidCode' | 'unavailable'; email?: string };

const callbackUrl = (next: string) => `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;

export async function sendSignInLink(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = normalizeEmail(formData.get('email'));
  if (!email) return { status: 'error', error: 'invalidEmail' };
  const next = safeNext(formData.get('next'));
  const supabase = await sessionClient();
  if (!supabase) return { status: 'error', error: 'unavailable', email };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: true },
  });
  if (error) {
    console.error('Sign-in link failed', error.code ?? error.status);
    return { status: 'error', error: 'unavailable', email };
  }
  return { status: 'sent', email };
}

export async function verifySignInCode(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = normalizeEmail(formData.get('email'));
  const code = String(formData.get('code') ?? '').replace(/\s/g, '');
  if (!email) return { status: 'error', error: 'invalidEmail' };
  if (!/^\d{6}$/.test(code)) return { status: 'error', error: 'invalidCode', email };
  const supabase = await sessionClient();
  if (!supabase) return { status: 'error', error: 'unavailable', email };
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) return { status: 'error', error: 'invalidCode', email };
  const next = safeNext(formData.get('next'));
  if (!next.startsWith('/checkout/claim')) await claimAfterSignIn();
  redirect(next);
}

export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = formData.get('provider');
  const next = safeNext(formData.get('next'));
  if (provider !== 'google' && provider !== 'apple') redirect('/login');
  const supabase = await sessionClient();
  if (!supabase) redirect(`/login?error=unavailable&next=${encodeURIComponent(next)}`);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl(next) },
  });
  if (error || !data.url) redirect(`/login?error=unavailable&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await sessionClient();
  await supabase?.auth.signOut();
  redirect('/');
}
