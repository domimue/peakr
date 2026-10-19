import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/data/supabase';

/**
 * Connecting services. The OAuth flow runs through the Edge Function `oauth`: it signs the state,
 * Strava redirects back to the function, which exchanges the code with the client secret (never in
 * the app), stores the tokens encrypted and deep-links back to `peakr://integrations/<provider>`.
 * On Android the Strava app may handle the consent screen; the deep link then arrives through the
 * router (`app/integrations/[provider].tsx`) instead of the auth session result.
 */

export type ConnectResult = 'connected' | 'denied' | 'error' | 'cancelled';

export type Provider = 'strava';

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export function statusFromUrl(url: string): ConnectResult {
  const status = Linking.parse(url).queryParams?.status;
  return status === 'connected' || status === 'denied' ? status : 'error';
}

export async function connect(provider: Provider): Promise<ConnectResult> {
  const { data, error } = await client().functions.invoke<{ url: string }>('oauth/start', {
    body: { provider },
  });
  if (error || !data?.url) return 'error';
  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    Linking.createURL(`integrations/${provider}`),
  );
  return result.type === 'success' ? statusFromUrl(result.url) : 'cancelled';
}

/** Revokes access at the provider and deletes tokens and imported data on the server. */
export async function disconnect(provider: Provider): Promise<boolean> {
  const { error } = await client().functions.invoke('oauth/disconnect', { body: { provider } });
  return !error;
}

export type SyncNowResult = { ok: true; imported: number } | { ok: false; reason: string };

/** "Sync now": the server pulls activities from Strava since the last import. */
export async function syncStravaNow(): Promise<SyncNowResult> {
  const { data, error } = await client().functions.invoke<{ imported: number }>('strava-sync', {
    body: {},
  });
  if (!error && data) return { ok: true, imported: data.imported };
  let reason = 'error';
  try {
    const context = (error as { context?: Response } | null)?.context;
    reason = ((await context?.json()) as { error?: string } | undefined)?.error ?? 'error';
  } catch {
    // Not JSON (network error).
  }
  return { ok: false, reason };
}
