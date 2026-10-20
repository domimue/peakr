import type { SupabaseClient } from '@supabase/supabase-js';

import { decryptToken, encryptToken } from './crypto.ts';
import { getProvider } from './providers.ts';
import { pushToUser } from './push.ts';
import { mapStravaActivity, type ActivityRow, type StravaActivity } from './strava-map.ts';
import {
  MAX_GPX_CHARS,
  mapStravaRoute,
  routeChanged,
  type StravaRoute,
  type StravaRouteRow,
} from './strava-routes-map.ts';
import { mapStravaStreams, type StravaStreams } from './strava-streams.ts';

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

/** GET against the Strava API; non-2xx responses throw a `StravaError` with the status. */
export async function stravaGet<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new StravaError(
      response.status,
      `${path} → ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

async function getText(token: string, path: string): Promise<string> {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new StravaError(
      response.status,
      `${path} → ${response.status}: ${await response.text()}`,
    );
  }
  return await response.text();
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

/** A deleted stream keeps no data either. */
const STREAM_TOMBSTONE = {
  deleted: true,
  distance_m: null,
  altitude_m: null,
  time_s: null,
  heartrate: null,
  latlng: null,
};

async function deleteStreams(
  admin: SupabaseClient,
  userId: string,
  externalId?: string,
): Promise<void> {
  let query = admin
    .from('activity_streams')
    .update(STREAM_TOMBSTONE)
    .eq('user_id', userId)
    .eq('source', 'strava')
    .eq('deleted', false);
  if (externalId !== undefined) query = query.eq('external_id', externalId);
  const { error } = await query;
  if (error) throw error;
}

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
  await deleteStreams(admin, userId, externalId);
}

/** Only outdoor runs and rides have an elevation profile worth evaluating per km. */
export function wantsStreams(row: { sport: string | null; indoor: boolean }): boolean {
  return (row.sport === 'run' || row.sport === 'bike') && !row.indoor;
}

const STREAM_KEYS = 'distance,altitude,time,heartrate,latlng';

/**
 * Fetches the activity's streams and stores them downsampled (an activity without a usable
 * elevation profile loses any stored stream). Throws only on Strava's rate limit (429) and an
 * invalid token (401), so callers can stop; any other failure is logged and returns false – the
 * activity itself is stored either way.
 */
export async function importStreams(
  admin: SupabaseClient,
  token: string,
  userId: string,
  externalId: string,
): Promise<boolean> {
  try {
    const streams = await stravaGet<StravaStreams>(
      token,
      `/activities/${encodeURIComponent(externalId)}/streams?keys=${STREAM_KEYS}&key_by_type=true`,
    );
    const row = mapStravaStreams(userId, externalId, streams);
    if (!row) {
      await deleteStreams(admin, userId, externalId);
      return false;
    }
    const { error } = await admin
      .from('activity_streams')
      .upsert(row, { onConflict: 'user_id,source,external_id' });
    if (error) throw error;
    return true;
  } catch (e) {
    if (e instanceof StravaError && (e.status === 429 || e.status === 401)) throw e;
    // The error text can contain Strava's response; the status is enough to debug.
    const status = (e as { status?: number }).status;
    console.warn('Strava streams import failed', externalId, status ?? String(e));
    return false;
  }
}

/** Of the given activities, those that have no stored stream yet. */
async function withoutStreams(
  admin: SupabaseClient,
  userId: string,
  externalIds: string[],
): Promise<string[]> {
  if (externalIds.length === 0) return [];
  const { data, error } = await admin
    .from('activity_streams')
    .select('external_id')
    .eq('user_id', userId)
    .eq('source', 'strava')
    .eq('deleted', false)
    .in('external_id', externalIds);
  if (error) throw error;
  const stored = new Set((data ?? []).map((r) => r.external_id as string));
  return externalIds.filter((id) => !stored.has(id));
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
 * a supported sport is removed). Outdoor runs and rides also get their streams (elevation profile
 * for the per-km evaluation). New activities wake the user's devices with a push.
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
    activity = await stravaGet<StravaActivity>(
      token,
      `/activities/${encodeURIComponent(activityId)}`,
    );
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
  if (wantsStreams(row)) await importStreams(admin, token, integration.user_id, row.external_id);
  else await deleteStreams(admin, integration.user_id, row.external_id);
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

export interface ImportOptions {
  /** List pages of 100 activities. */
  maxPages?: number;
  /**
   * At most this many outdoor runs/rides without a stored stream also get their streams fetched
   * (one request each). 0 = summaries only – the history import, which would otherwise spend
   * Strava's rate limit on hundreds of activities; the app asks `strava-sync/streams` instead.
   */
  maxStreams?: number;
}

/**
 * Pulls the athlete's activities since `afterMs` (list endpoint, which already carries the summary
 * polyline and heart rate – one request per 100 activities). Returns how many were stored.
 */
export async function importSince(
  admin: SupabaseClient,
  integration: StravaIntegration,
  afterMs: number,
  { maxPages = 3, maxStreams = 0 }: ImportOptions = {},
): Promise<number> {
  const token = await accessToken(admin, integration);
  const after = Math.floor(afterMs / 1000);
  let stored = 0;
  const outdoor: string[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const list = await stravaGet<StravaActivity[]>(
      token,
      `/athlete/activities?after=${after}&per_page=100&page=${page}`,
    );
    const rows = list
      .map((a) => mapStravaActivity(integration.user_id, a))
      .filter((r): r is ActivityRow => r !== null);
    await upsert(admin, rows);
    stored += rows.length;
    outdoor.push(...rows.filter(wantsStreams).map((r) => r.external_id));
    if (list.length < 100) break;
  }
  if (maxStreams > 0) {
    // Newest first (the list is oldest first).
    const missing = await withoutStreams(admin, integration.user_id, outdoor.reverse());
    for (const id of missing.slice(0, maxStreams)) {
      await importStreams(admin, token, integration.user_id, id);
    }
  }
  await touchSynced(admin, integration);
  return stored;
}

/** A route that is gone keeps no data. */
const ROUTE_TOMBSTONE = {
  deleted: true,
  name: null,
  sport: null,
  distance_m: null,
  elevation_gain_m: null,
  private: false,
  strava_updated_at: null,
  gpx: null,
};

/** Route list pages of 50 (up to 500 routes). */
const ROUTE_PAGES = 10;
const ROUTES_PER_PAGE = 50;

/**
 * Mirrors the routes the athlete planned in Strava (rides and runs) into `strava_routes`: one list
 * request per 50 routes, a GPX export only for new or changed routes, and a tombstone for every
 * route no longer listed. A failed export is logged and the route skipped (retried next time);
 * 429 and 401 propagate so callers can stop. Private routes need the `read_all` scope.
 */
export async function importStravaRoutes(
  admin: SupabaseClient,
  integration: StravaIntegration,
): Promise<{ imported: number; removed: number }> {
  const athleteId = integration.external_user_id;
  if (!athleteId) return { imported: 0, removed: 0 };
  const token = await accessToken(admin, integration);
  const userId = integration.user_id;

  const listed: StravaRouteRow[] = [];
  let complete = false;
  for (let page = 1; page <= ROUTE_PAGES; page++) {
    const list = await stravaGet<StravaRoute[]>(
      token,
      `/athletes/${encodeURIComponent(athleteId)}/routes?per_page=${ROUTES_PER_PAGE}&page=${page}`,
    );
    for (const route of list) {
      const row = mapStravaRoute(userId, route);
      if (row) listed.push(row);
    }
    if (list.length < ROUTES_PER_PAGE) {
      complete = true;
      break;
    }
  }

  const { data: storedRows, error } = await admin
    .from('strava_routes')
    .select('external_id, strava_updated_at, deleted')
    .eq('user_id', userId);
  if (error) throw error;
  const stored = new Map(
    (storedRows ?? []).map((r) => [
      r.external_id as string,
      { strava_updated_at: r.strava_updated_at as string | null, deleted: r.deleted as boolean },
    ]),
  );

  let imported = 0;
  for (const row of listed) {
    if (!routeChanged(row, stored.get(row.external_id))) continue;
    try {
      const gpx = await getText(token, `/routes/${encodeURIComponent(row.external_id)}/export_gpx`);
      if (gpx.length > MAX_GPX_CHARS) {
        console.warn('Strava route GPX too large, skipped', row.external_id, gpx.length);
        continue;
      }
      const { error: upsertError } = await admin
        .from('strava_routes')
        .upsert({ ...row, gpx }, { onConflict: 'user_id,external_id' });
      if (upsertError) throw upsertError;
      imported++;
    } catch (e) {
      if (e instanceof StravaError && (e.status === 429 || e.status === 401)) throw e;
      const status = (e as { status?: number }).status;
      console.warn('Strava route export failed', row.external_id, status ?? String(e));
    }
  }

  // Only a complete list proves a route is gone (more than ROUTE_PAGES pages: keep the rest).
  let removed = 0;
  if (complete) {
    const listedIds = new Set(listed.map((r) => r.external_id));
    const gone = [...stored]
      .filter(([id, s]) => !s.deleted && !listedIds.has(id))
      .map(([id]) => id);
    if (gone.length > 0) {
      const { error: removeError } = await admin
        .from('strava_routes')
        .update(ROUTE_TOMBSTONE)
        .eq('user_id', userId)
        .in('external_id', gone);
      if (removeError) throw removeError;
      removed = gone.length;
    }
  }
  return { imported, removed };
}

/**
 * Disconnect, deauthorisation at Strava, account deletion: removes Strava's data. Activities,
 * their streams and Strava routes become tombstones without any data, so the user's devices delete them too.
 * The baseline (reference-only, never synced to devices) is deleted outright.
 */
export async function removeStravaData(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin
    .from('activities')
    .update(TOMBSTONE)
    .eq('user_id', userId)
    .eq('source', 'strava')
    .eq('deleted', false);
  if (error) throw error;
  await deleteStreams(admin, userId);
  const { error: routeError } = await admin
    .from('strava_routes')
    .update(ROUTE_TOMBSTONE)
    .eq('user_id', userId)
    .eq('deleted', false);
  if (routeError) throw routeError;
  await removeBaseline(admin, userId);
  await admin.from('integrations').delete().eq('user_id', userId).eq('provider', 'strava');
}

/** Deletes the user's baseline activities and import record (CLAUDE.md "Baseline …"). */
export async function removeBaseline(admin: SupabaseClient, userId: string): Promise<void> {
  for (const table of ['baseline_activities', 'baseline_imports']) {
    const { error } = await admin.from(table).delete().eq('user_id', userId);
    if (error) throw error;
  }
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
