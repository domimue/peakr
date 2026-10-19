import type { SupabaseClient } from '@supabase/supabase-js';

import { decryptToken, encryptToken } from './crypto.ts';
import { getProvider } from './providers.ts';
import { pushToUser } from './push.ts';
import { mapStravaActivity, type ActivityRow, type StravaActivity } from './strava-map.ts';

/**
 * Strava activity import shared by the webhook, "sync now" and the nightly catch-up. Activities are
 * stored only for the athlete who connected them and only to adapt their own plan (Strava API
 * Agreement); disconnecting deletes them.
 */

const API = 'https://www.strava.com/api/v3';
/** Refresh the access token when it expires within this time. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface StravaIntegration {
  id: string;
  user_id: string;
  external_user_id: string | null;
  expires_at: string | null;
  last_synced_at: string | null;
  status: string;
}

const COLUMNS = 'id, user_id, external_user_id, expires_at, last_synced_at, status';

export class StravaError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function integrationForAthlete(
  admin: SupabaseClient,
  athleteId: string,
): Promise<StravaIntegration | null> {
  const { data, error } = await admin
    .from('integrations')
    .select(COLUMNS)
    .eq('provider', 'strava')
    .eq('external_user_id', athleteId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function integrationForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<StravaIntegration | null> {
  const { data, error } = await admin
    .from('integrations')
    .select(COLUMNS)
    .eq('provider', 'strava')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function activeIntegrations(admin: SupabaseClient): Promise<StravaIntegration[]> {
  const { data, error } = await admin
    .from('integrations')
    .select(COLUMNS)
    .eq('provider', 'strava')
    .eq('status', 'active');
  if (error) throw error;
  return data ?? [];
}

/** A valid access token, refreshed (and stored again) shortly before it expires. */
export async function accessToken(
  admin: SupabaseClient,
  integration: StravaIntegration,
): Promise<string> {
  const { data: stored, error } = await admin
    .from('integration_tokens')
    .select('access_token, refresh_token')
    .eq('integration_id', integration.id)
    .single();
  if (error) throw error;
  const expiresAt = integration.expires_at ? Date.parse(integration.expires_at) : 0;
  if (expiresAt - REFRESH_MARGIN_MS > Date.now()) return decryptToken(stored.access_token);
  if (!stored.refresh_token) throw new StravaError(401, 'No refresh token');

  const provider = getProvider('strava');
  if (!provider) throw new Error('Strava provider missing');
  let tokens;
  try {
    tokens = await provider.refresh(await decryptToken(stored.refresh_token));
  } catch (e) {
    // The athlete revoked access at Strava or the refresh token is no longer valid.
    await admin.from('integrations').update({ status: 'expired' }).eq('id', integration.id);
    throw new StravaError(401, `Refresh failed: ${String(e)}`);
  }
  const { error: tokenError } = await admin
    .from('integration_tokens')
    .update({
      access_token: await encryptToken(tokens.accessToken),
      refresh_token: tokens.refreshToken ? await encryptToken(tokens.refreshToken) : null,
    })
    .eq('integration_id', integration.id);
  if (tokenError) throw tokenError;
  const expires = tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null;
  await admin
    .from('integrations')
    .update({ expires_at: expires, status: 'active' })
    .eq('id', integration.id);
  integration.expires_at = expires;
  return tokens.accessToken;
}

async function get<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new StravaError(
      response.status,
      `${path} → ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

async function upsert(admin: SupabaseClient, rows: ActivityRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await admin
    .from('activities')
    .upsert(rows, { onConflict: 'user_id,source,external_id' });
  if (error) throw error;
}

/** A deleted activity keeps no data (it may no longer be stored). */
const TOMBSTONE = {
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
};

export async function deleteActivity(
  admin: SupabaseClient,
  userId: string,
  externalId: string,
): Promise<void> {
  const { error } = await admin
    .from('activities')
    .update(TOMBSTONE)
    .eq('user_id', userId)
    .eq('source', 'strava')
    .eq('external_id', externalId);
  if (error) throw error;
}

async function touchSynced(admin: SupabaseClient, integration: StravaIntegration): Promise<void> {
  const now = new Date().toISOString();
  await admin.from('integrations').update({ last_synced_at: now }).eq('id', integration.id);
  integration.last_synced_at = now;
}

const SPORT_NAMES: Record<string, string> = {
  run: 'Run',
  bike: 'Ride',
  swim: 'Swim',
  walk: 'Walk',
  xcski: 'XC ski session',
  skitour: 'Ski tour',
  snowshoe: 'Snowshoe hike',
};

/**
 * Webhook `create` / `update`: fetches the activity and stores it (an activity that is no longer
 * a supported sport is removed). New activities wake the user's devices with a push.
 */
export async function importActivity(
  admin: SupabaseClient,
  integration: StravaIntegration,
  activityId: string,
  isNew: boolean,
): Promise<void> {
  const token = await accessToken(admin, integration);
  let activity: StravaActivity;
  try {
    activity = await get<StravaActivity>(token, `/activities/${encodeURIComponent(activityId)}`);
  } catch (e) {
    // Deleted in the meantime, or private and not covered by the granted scope.
    if (e instanceof StravaError && (e.status === 404 || e.status === 403)) {
      await deleteActivity(admin, integration.user_id, activityId);
      return;
    }
    throw e;
  }
  const row = mapStravaActivity(integration.user_id, activity);
  if (!row) {
    await deleteActivity(admin, integration.user_id, activityId);
    return;
  }
  await upsert(admin, [row]);
  await touchSynced(admin, integration);
  if (isNew) {
    await pushToUser(
      admin,
      integration.user_id,
      { type: 'activity', source: 'strava', id: row.external_id },
      {
        title: `${SPORT_NAMES[row.sport] ?? 'Activity'} synced from Strava`,
        body: 'Open Peakr to see how it fits your plan.',
      },
    );
  }
}

/**
 * Pulls the athlete's activities since `afterMs` (list endpoint, which already carries the summary
 * polyline and heart rate – one request per 100 activities). Returns how many were stored.
 */
export async function importSince(
  admin: SupabaseClient,
  integration: StravaIntegration,
  afterMs: number,
  maxPages = 3,
): Promise<number> {
  const token = await accessToken(admin, integration);
  const after = Math.floor(afterMs / 1000);
  let stored = 0;
  for (let page = 1; page <= maxPages; page++) {
    const list = await get<StravaActivity[]>(
      token,
      `/athlete/activities?after=${after}&per_page=100&page=${page}`,
    );
    const rows = list
      .map((a) => mapStravaActivity(integration.user_id, a))
      .filter((r): r is ActivityRow => r !== null);
    await upsert(admin, rows);
    stored += rows.length;
    if (list.length < 100) break;
  }
  await touchSynced(admin, integration);
  return stored;
}

/**
 * Disconnect, deauthorisation at Strava, account deletion: removes Strava's data. Activities become
 * tombstones without any data, so the user's devices delete them too.
 */
export async function removeStravaData(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin
    .from('activities')
    .update(TOMBSTONE)
    .eq('user_id', userId)
    .eq('source', 'strava')
    .eq('deleted', false);
  if (error) throw error;
  await admin.from('integrations').delete().eq('user_id', userId).eq('provider', 'strava');
}

/** Revokes the token at Strava (best effort) – used before removing the data. */
export async function revokeAtStrava(
  admin: SupabaseClient,
  integration: StravaIntegration,
): Promise<void> {
  const provider = getProvider('strava');
  try {
    if (provider) await provider.revoke(await accessToken(admin, integration));
  } catch (e) {
    console.warn('Strava revoke failed', String(e));
  }
}
