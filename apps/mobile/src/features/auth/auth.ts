import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as Network from 'expo-network';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { setReconnectHint } from '@/data/repositories/baseline-repository';
import { supabase } from '@/data/supabase';
import { clearAllLocalData, clearSyncedData } from '@/data/sync/sync-repository';
import { requestSync, useSyncStore } from '@/data/sync/use-background-sync';
import { unregisterPushToken, usePushStore } from '@/features/notifications/push';

import { useSessionStore } from './session-store';

/**
 * Sign-in methods: email magic link (with a 6-digit code as fallback), Google and Sign in with
 * Apple. Every redirect comes back to peakr://auth/callback (allowed in Supabase → Auth → URL
 * configuration). Errors are thrown; the screens show a generic message.
 *
 * When the quiz created an anonymous user (e.g. to connect Strava), signing in converts that user
 * into the account – same user id, so whatever it connected carries over: the email is added with
 * `updateUser`, Google and Apple are linked with `linkIdentity`. If the email or identity already
 * belongs to an account, the anonymous user is deleted and the normal sign-in follows.
 */

export const authCallbackUrl = () => Linking.createURL('auth/callback');

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

const isAnonymous = () => useSessionStore.getState().isAnonymous;

const errorCode = (error: unknown) => (error as { code?: unknown } | null)?.code;

/**
 * The anonymous quiz user cannot become the account (its email or identity is taken): delete it on
 * the server (Edge Function `delete-account`, also revokes a Strava connection), forget it on this
 * device and remember to ask for Strava again. Local data (the plan) stays and moves into the
 * account on the first sync.
 */
async function discardAnonymousUser(): Promise<void> {
  const { error } = await client().functions.invoke('delete-account', { body: {} });
  if (error) throw error;
  await client().auth.signOut({ scope: 'local' });
  // Without waiting for the auth listener: the sign-in that follows must not link again.
  useSessionStore.setState({ session: null, isAnonymous: false });
  await setReconnectHint();
}

/**
 * 'signIn': a sign-in link (+ code) went out. 'convert': an anonymous user is getting this email –
 * the link (+ code) confirms the email change and turns it into the account.
 */
export type EmailFlow = 'signIn' | 'convert';

export async function sendMagicLink(email: string): Promise<EmailFlow> {
  const address = email.trim().toLowerCase();
  const emailRedirectTo = authCallbackUrl();
  if (isAnonymous()) {
    const { error } = await client().auth.updateUser({ email: address }, { emailRedirectTo });
    if (!error) return 'convert';
    if (errorCode(error) !== 'email_exists') throw error;
    await discardAnonymousUser();
  }
  const { error } = await client().auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo, shouldCreateUser: true },
  });
  if (error) throw error;
  return 'signIn';
}

/** The code from the same email, for when the link opens on another device or browser. */
export async function verifyEmailCode(
  email: string,
  code: string,
  flow: EmailFlow = 'signIn',
): Promise<void> {
  const { error } = await client().auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: flow === 'convert' ? 'email_change' : 'email',
  });
  if (error) throw error;
}

/** Completes a magic-link, email-change or OAuth redirect (`?code=…`, PKCE). */
export async function completeSignIn(code: string): Promise<void> {
  const auth = client().auth;
  const { error } = await auth.exchangeCodeForSession(code);
  if (!error) return;
  // The auth browser and the deep-link route can both deliver the same code; one of them wins.
  // An anonymous session that is still there means the conversion did not happen.
  const { session } = (await auth.getSession()).data;
  if (!session || session.user.is_anonymous) throw error;
}

/** Query and fragment parameters of a redirect URL (an error can arrive in either). */
function redirectParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const [beforeHash = '', hash = ''] = url.split('#', 2);
  const queryStart = beforeHash.indexOf('?');
  const query = queryStart >= 0 ? beforeHash.slice(queryStart + 1) : '';
  for (const pair of `${query}&${hash}`.split('&')) {
    if (!pair) continue;
    const [key = '', value = ''] = pair.split('=', 2);
    params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return params;
}

/**
 * Google via Supabase's OAuth flow in an auth browser session – linked to the anonymous quiz user
 * when there is one. Returns false when cancelled.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const redirectTo = authCallbackUrl();
  const auth = client().auth;
  const options = { redirectTo, skipBrowserRedirect: true };
  const link = isAnonymous();
  const { data, error } = link
    ? await auth.linkIdentity({ provider: 'google', options })
    : await auth.signInWithOAuth({ provider: 'google', options });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  const params = redirectParams(result.url);
  if (link && params.error_code === 'identity_already_exists') {
    // The Google account already has a Peakr account: sign in to that one instead.
    await discardAnonymousUser();
    return signInWithGoogle();
  }
  if (!params.code) throw new Error(params.error_description ?? 'No code returned');
  await completeSignIn(params.code);
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
    const auth = client().auth;
    const token = { provider: 'apple', token: credential.identityToken } as const;
    if (isAnonymous()) {
      const { error } = await auth.linkIdentity(token);
      if (!error) return true;
      if (errorCode(error) !== 'identity_already_exists') throw error;
      await discardAnonymousUser();
    }
    const { error } = await auth.signInWithIdToken(token);
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
  // This device stops receiving the account's activity pushes (best effort, needs the session).
  await unregisterPushToken().catch((e: unknown) => console.warn('Push unregister failed', e));
  const { error } = await client().auth.signOut();
  if (error) throw error;
  clearSyncedData();
  return 'done';
}

export type DeleteAccountResult = 'deleted' | 'offline' | 'failed';

/** HTTP status of a failed `functions.invoke`, or null for a network error. */
function httpStatus(error: unknown): number | null {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  return typeof status === 'number' ? status : null;
}

/**
 * Deletes the account on the server (Edge Function `delete-account`: revokes Strava, deletes all
 * rows and the auth user), then removes everything from this device and signs out. Offline or on a
 * server error nothing is deleted locally, so the user can simply try again.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const network = await Network.getNetworkStateAsync();
  if (network.isInternetReachable === false || network.isConnected === false) return 'offline';

  const auth = client().auth;
  const { error } = await client().functions.invoke('delete-account', { body: {} });
  if (error) {
    const status = httpStatus(error);
    if (status === null) return 'offline';
    // A retry after the server already deleted the user (the first answer got lost): the session
    // no longer belongs to an existing user.
    const userError = status === 401 ? (await auth.getUser()).error : null;
    const gone = userError?.code === 'user_not_found' || userError?.status === 403;
    if (!gone) return 'failed';
  }

  // The server session no longer exists – only forget it on this device.
  await auth.signOut({ scope: 'local' }).catch((e: unknown) => console.warn('Sign-out failed', e));
  clearAllLocalData();
  useSyncStore.setState({ status: 'idle', lastSyncedAt: null, error: null });
  usePushStore.setState({ token: null, activityAlerts: false });
  return 'deleted';
}
