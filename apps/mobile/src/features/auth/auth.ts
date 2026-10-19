import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/data/supabase';
import { clearSyncedData } from '@/data/sync/sync-repository';
import { requestSync, useSyncStore } from '@/data/sync/use-background-sync';

/**
 * Sign-in methods: email magic link (with a 6-digit code as fallback), Google and Sign in with
 * Apple. Every redirect comes back to peakr://auth/callback (allowed in Supabase → Auth → URL
 * configuration). Errors are thrown; the screens show a generic message.
 */

export const authCallbackUrl = () => Linking.createURL('auth/callback');

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: authCallbackUrl(), shouldCreateUser: true },
  });
  if (error) throw error;
}

/** The code from the same email, for when the link opens on another device or browser. */
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const { error } = await client().auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw error;
}

/** Completes a magic-link or OAuth redirect (`?code=…`, PKCE). */
export async function completeSignIn(code: string): Promise<void> {
  const auth = client().auth;
  const { error } = await auth.exchangeCodeForSession(code);
  // The auth browser and the deep-link route can both deliver the same code; one of them wins.
  if (error && !(await auth.getSession()).data.session) throw error;
}

/** Google via Supabase's OAuth flow in an auth browser session. Returns false when cancelled. */
export async function signInWithGoogle(): Promise<boolean> {
  const redirectTo = authCallbackUrl();
  const { data, error } = await client().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  const { queryParams } = Linking.parse(result.url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  if (!code) throw new Error(String(queryParams?.error_description ?? 'No code returned'));
  await completeSignIn(code);
  return true;
}

/**
 * Sign in with Apple is offered on iOS only, where the App Store requires it next to Google. It
 * uses the native sheet and needs no client secret in Supabase.
 */
export const appleSignInAvailable = Platform.OS === 'ios';

/** Returns false when the user cancelled. */
export async function signInWithApple(): Promise<boolean> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error('No identity token from Apple');
    const { error } = await client().auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) throw error;
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
    throw error;
  }
}

/**
 * Signs out after a last push of local changes. The synced plan is removed from the device (it
 * stays in the account), so the next account starts empty. Returns 'unsynced' without signing
 * out when that push failed (offline) – unless `force`, which drops the unsynced changes.
 */
export async function signOut(userId: string, force = false): Promise<'done' | 'unsynced'> {
  await requestSync(userId);
  if (!force && useSyncStore.getState().status !== 'idle') return 'unsynced';
  const { error } = await client().auth.signOut();
  if (error) throw error;
  clearSyncedData();
  return 'done';
}
