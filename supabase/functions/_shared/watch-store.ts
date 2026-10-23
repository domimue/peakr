import type { SupabaseClient } from '@supabase/supabase-js';

import { decryptToken, encryptToken } from './crypto.ts';
import { getProvider } from './providers.ts';
import { pushToUser } from './push.ts';
import type { WatchActivityRow } from './watch/model.ts';
import type { PushedRecord } from './watch/sync.ts';

/**
 * Database side of the watch platforms (Garmin, COROS, Suunto): connected accounts with a valid
 * token, what was pushed (for re-sync), and the activities they deliver into the same
 * `activities` table and pipeline as Strava. Service role only.
 */

export type WatchPlatform = 'garmin' | 'coros' | 'suunto';

export interface WatchIntegration {
  id: string;
  user_id: string;
  provider: WatchPlatform;
  external_user_id: string | null;
  expires_at: string | null;
  status: string;
}

const COLUMNS = 'id, user_id, provider, external_user_id, expires_at, status';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export async function integrationFor(
  admin: SupabaseClient,
  userId: string,
  provider: WatchPlatform,
): Promise<WatchIntegration | null> {
  const { data, error } = await admin
    .from('integrations')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw error;
  return data as WatchIntegration | null;
}

/** The Peakr user behind a platform user id (Garmin userId, COROS openId, Suunto username). */
export async function integrationForExternal(
  admin: SupabaseClient,
  provider: WatchPlatform,
  externalUserId: string,
): Promise<WatchIntegration | null> {
  const { data, error } = await admin
    .from('integrations')
    .select(COLUMNS)
    .eq('provider', provider)
    .eq('external_user_id', externalUserId)
    .maybeSingle();
  if (error) throw error;
  return data as WatchIntegration | null;
}

export class WatchAuthError extends Error {}

/** A valid access token, refreshed (and stored again) shortly before it expires. */
export async function watchAccessToken(
  admin: SupabaseClient,
  integration: WatchIntegration,
): Promise<string> {
  const { data: stored, error } = await admin
    .from('integration_tokens')
    .select('access_token, refresh_token')
    .eq('integration_id', integration.id)
    .single();
  if (error) throw error;
  const expiresAt = integration.expires_at ? Date.parse(integration.expires_at) : null;
  if (expiresAt === null || expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return decryptToken(stored.access_token);
  }
  const provider = getProvider(integration.provider);
  if (!provider || !stored.refresh_token) throw new WatchAuthError('No refresh token');
  let tokens;
  try {
    tokens = await provider.refresh(await decryptToken(stored.refresh_token));
  } catch (e) {
    await admin.from('integrations').update({ status: 'expired' }).eq('id', integration.id);
    throw new WatchAuthError(`Refresh failed: ${String(e)}`);
  }
  await admin
    .from('integration_tokens')
    .update({
      access_token: await encryptToken(tokens.accessToken),
      refresh_token: tokens.refreshToken ? await encryptToken(tokens.refreshToken) : null,
    })
    .eq('integration_id', integration.id);
  const expires = tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null;
  await admin
    .from('integrations')
    .update({ expires_at: expires, status: 'active' })
    .eq('id', integration.id);
  integration.expires_at = expires;
  return tokens.accessToken;
}

// ---------------------------------------------------------------------------------------------
// What was pushed

export async function loadPushed(
  admin: SupabaseClient,
  userId: string,
  provider: WatchPlatform,
  kind: 'workout' | 'route' = 'workout',
): Promise<PushedRecord[]> {
  const { data, error } = await admin
    .from('watch_pushes')
    .select('item_id, external_id, extra, hash')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('kind', kind);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    workoutId: r.item_id as string,
    externalId: r.external_id as string,
    ...(r.extra ? { extra: r.extra as string } : {}),
    hash: r.hash as string,
  }));
}

/** Replaces the stored records of a platform with the outcome of a sync run. */
export async function savePushed(
  admin: SupabaseClient,
  userId: string,
  provider: WatchPlatform,
  records: readonly PushedRecord[],
  kind: 'workout' | 'route' = 'workout',
): Promise<void> {
  if (records.length > 0) {
    const { error } = await admin.from('watch_pushes').upsert(
      records.map((r) => ({
        user_id: userId,
        provider,
        kind,
        item_id: r.workoutId,
        external_id: r.externalId,
        extra: r.extra ?? null,
        hash: r.hash,
        pushed_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,provider,kind,item_id' },
    );
    if (error) throw error;
  }
  // Records that are gone from the outcome were removed at the platform.
  const keep = new Set(records.map((r) => r.workoutId));
  const existing = await loadPushed(admin, userId, provider, kind);
  const stale = existing.map((r) => r.workoutId).filter((id) => !keep.has(id));
  if (stale.length > 0) {
    const { error } = await admin
      .from('watch_pushes')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('kind', kind)
      .in('item_id', stale);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Activities

/**
 * Stores activities from a watch platform in the shared `activities` table (one row per source
 * record; the app deduplicates against Strava and Health data, watch providers win) and wakes the
 * user's devices once per new activity.
 */
export async function storeWatchActivities(
  admin: SupabaseClient,
  rows: readonly WatchActivityRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await admin
    .from('activities')
    .upsert([...rows], { onConflict: 'user_id,source,external_id' });
  if (error) throw error;
  const [first] = rows;
  if (!first) return;
  await pushToUser(
    admin,
    first.user_id,
    { type: 'activity', source: first.source, id: first.external_id },
    {
      title: `Activity synced from ${first.source[0]?.toUpperCase()}${first.source.slice(1)}`,
      body: 'Open Peakr to see how it fits your plan.',
    },
  );
}

/** A deleted activity keeps no data (same tombstone as Strava's). */
export async function tombstoneWatchActivity(
  admin: SupabaseClient,
  userId: string,
  source: WatchPlatform,
  externalId: string,
): Promise<void> {
  const { error } = await admin
    .from('activities')
    .update({
      deleted: true,
      sport: null,
      source_type: null,
      name: null,
      start_time: null,
      start_date_local: null,
      duration_sec: null,
      elapsed_sec: null,
      distance_m: null,
      elevation_gain_m: null,
      avg_hr: null,
      max_hr: null,
      swim_pace_sec_per_100m: null,
      polyline: null,
    })
    .eq('user_id', userId)
    .eq('source', source)
    .eq('external_id', externalId);
  if (error) throw error;
}

/** Disconnect / deregistration / account deletion: the platform's data and pushes go. */
export async function removeWatchData(
  admin: SupabaseClient,
  userId: string,
  provider: string,
): Promise<void> {
  if (provider !== 'garmin' && provider !== 'coros' && provider !== 'suunto') return;
  const { data: rows, error } = await admin
    .from('activities')
    .select('external_id')
    .eq('user_id', userId)
    .eq('source', provider)
    .eq('deleted', false);
  if (error) throw error;
  for (const r of rows ?? []) {
    await tombstoneWatchActivity(admin, userId, provider, r.external_id as string);
  }
  await admin.from('watch_pushes').delete().eq('user_id', userId).eq('provider', provider);
}
