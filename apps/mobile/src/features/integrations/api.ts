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

async function invokeSync(path: string, body: object): Promise<SyncNowResult> {
  const { data, error } = await client().functions.invoke<{ imported: number }>(path, { body });
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

/** "Sync now": the server pulls activities from Strava since the last import. */
export function syncStravaNow(): Promise<SyncNowResult> {
  return invokeSync('strava-sync', {});
}

/**
 * Route recognition: the server imports the summaries of the last 180 days (one Strava call per
 * 100 activities), so routes run before Peakr was connected can be recognised too.
 */
export function importStravaHistory(): Promise<SyncNowResult> {
  return invokeSync('strava-sync/history', {});
}

/** Elevation streams of up to 10 activities that were imported without them. */
export async function fetchStravaStreams(externalIds: readonly string[]): Promise<boolean> {
  const { data, error } = await client().functions.invoke<{ stored: string[] }>(
    'strava-sync/streams',
    { body: { externalIds: externalIds.slice(0, 10) } },
  );
  return !error && (data?.stored.length ?? 0) > 0;
}
