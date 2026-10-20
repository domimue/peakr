/**
 * Baseline from past activities (plan calibration, CLAUDE.md "Baseline from past activities").
 *
 *   POST   /strava-baseline/import  (Authorization: user JWT, also anonymous)
 *          → { activities, hrZones, zonesScopeMissing }
 *          Reads the athlete's runs, rides and swims of the last 60 days and replaces the user's
 *          rows in `baseline_activities`. Up to 10 candidates (with HR, ≥ 20 min, highest average
 *          HR first) get their time + HR streams fetched once for `best_20min_hr`; the streams
 *          themselves are not stored. With the `profile:read_all` scope the athlete's own Strava
 *          HR zones are kept too (only if they set custom zones).
 *   DELETE /strava-baseline         (Authorization: user JWT)  → { ok }
 *          Removes the user's baseline.
 *
 * Reference only: this never writes `activities`, `activity_streams` or
 * `integrations.last_synced_at`, so nothing here becomes training history or reaches the app's
 * activity sync. The 60-day window is fixed here and never taken from the request.
 *
 * `verify_jwt = false` like `oauth`; the JWT is checked here.
 */

import {
  mapBaselineActivity,
  best20MinHr,
  type BaselineActivityRow,
  type StravaActivity,
} from '../_shared/strava-map.ts';
import {
  accessToken,
  integrationForUser,
  removeBaseline,
  StravaError,
  stravaGet,
} from '../_shared/strava.ts';
import { adminClient, json, userFromRequest } from '../_shared/supabase.ts';

const DAY_MS = 86_400_000;
const WINDOW_MS = 60 * DAY_MS;
/** List pages of 100 (up to 500 activities in 60 days). */
const MAX_PAGES = 5;
/** Streams fetched per import (each costs one Strava API call). */
const MAX_STREAMS = 10;
const MIN_STREAM_SEC = 20 * 60;
const ZONES_SCOPE = 'profile:read_all';

type Admin = ReturnType<typeof adminClient>;

interface StravaHrZones {
  custom_zones?: boolean;
  zones?: { min: number; max: number }[];
}

interface HrStreams {
  time?: { data?: (number | null)[] };
  heartrate?: { data?: (number | null)[] };
}

/** Rows worth a stream request: HR recorded, long enough for a 20-minute window. */
function streamCandidates(rows: BaselineActivityRow[]): BaselineActivityRow[] {
  return rows
    .filter(
      (r) =>
        // Swim HR reads low in water and says nothing about the LTHR on land.
        r.sport !== 'swim' && !r.manual && r.avg_hr !== null && r.duration_sec >= MIN_STREAM_SEC,
    )
    .sort((a, b) => (b.avg_hr ?? 0) - (a.avg_hr ?? 0))
    .slice(0, MAX_STREAMS);
}

/** `best_20min_hr` from the activity's streams; null on missing data or a failed request. */
async function fetchBest20MinHr(token: string, externalId: string): Promise<number | null> {
  try {
    const streams = await stravaGet<HrStreams>(
      token,
      `/activities/${encodeURIComponent(externalId)}/streams?keys=time,heartrate&key_by_type=true`,
    );
    const time: number[] = [];
    const heartrate: number[] = [];
    const t = streams.time?.data ?? [];
    const h = streams.heartrate?.data ?? [];
    for (let i = 0; i < Math.min(t.length, h.length); i++) {
      const ti = t[i];
      const hi = h[i];
      if (typeof ti === 'number' && typeof hi === 'number') {
        time.push(ti);
        heartrate.push(hi);
      }
    }
    return best20MinHr(time, heartrate);
  } catch (e) {
    if (e instanceof StravaError && (e.status === 429 || e.status === 401)) throw e;
    // The error text can contain Strava's response; the status is enough to debug.
    const status = (e as { status?: number }).status;
    console.warn('Baseline stream failed', externalId, status ?? String(e));
    return null;
  }
}

/** The athlete's custom HR zones, or null (default zones, no scope, failed request). */
async function fetchHrZones(token: string): Promise<StravaHrZones | null> {
  try {
    const zones = await stravaGet<{ heart_rate?: StravaHrZones }>(token, '/athlete/zones');
    const hr = zones.heart_rate;
    return hr?.custom_zones === true && Array.isArray(hr.zones) ? hr : null;
  } catch (e) {
    if (e instanceof StravaError && (e.status === 429 || e.status === 401)) throw e;
    const status = (e as { status?: number }).status;
    console.warn('Strava zones failed', status ?? String(e));
    return null;
  }
}

async function grantedScopes(admin: Admin, integrationId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('integrations')
    .select('scopes')
    .eq('id', integrationId)
    .single();
  if (error) throw error;
  return (data.scopes as string[] | null) ?? [];
}

async function importBaseline(req: Request): Promise<Response> {
  const admin = adminClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const integration = await integrationForUser(admin, user.id);
  if (!integration) return json({ error: 'not_connected' }, 404);
  try {
    const token = await accessToken(admin, integration);
    const after = Math.floor((Date.now() - WINDOW_MS) / 1000);

    const byId = new Map<string, BaselineActivityRow>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const list = await stravaGet<StravaActivity[]>(
        token,
        `/athlete/activities?after=${after}&per_page=100&page=${page}`,
      );
      for (const a of list) {
        const row = mapBaselineActivity(user.id, a);
        if (row) byId.set(row.external_id, row);
      }
      if (list.length < 100) break;
    }
    const rows = [...byId.values()];

    // A rate limit here only costs the LTHR estimate; the activities are still worth storing.
    try {
      for (const row of streamCandidates(rows)) {
        row.best_20min_hr = await fetchBest20MinHr(token, row.external_id);
      }
    } catch (e) {
      if (!(e instanceof StravaError && e.status === 429)) throw e;
      console.warn('Strava rate limit during baseline streams; continuing without');
    }

    const scopes = await grantedScopes(admin, integration.id);
    const zonesScopeMissing = !scopes.includes(ZONES_SCOPE);
    const hrZones = zonesScopeMissing ? null : await fetchHrZones(token);

    // Replace the previous baseline (recalibration reads the same window again).
    const { error: deleteError } = await admin
      .from('baseline_activities')
      .delete()
      .eq('user_id', user.id);
    if (deleteError) throw deleteError;
    let stored: unknown[] = [];
    if (rows.length > 0) {
      const { data, error } = await admin
        .from('baseline_activities')
        .insert(rows)
        .select(
          'id, external_id, sport, name, start_time, start_date_local, duration_sec, elapsed_sec, distance_m, elevation_gain_m, avg_hr, max_hr, swim_pace_sec_per_100m, indoor, manual, workout_type, best_20min_hr, fetched_at',
        )
        .order('start_time', { ascending: false });
      if (error) throw error;
      stored = data ?? [];
    }
    const { error: importError } = await admin.from('baseline_imports').upsert({
      user_id: user.id,
      strava_hr_zones: hrZones,
      imported_at: new Date().toISOString(),
    });
    if (importError) throw importError;

    return json({ activities: stored, hrZones, zonesScopeMissing });
  } catch (error) {
    if (error instanceof StravaError && error.status === 429) {
      return json({ error: 'rate_limited' }, 429);
    }
    if (error instanceof StravaError && error.status === 401) {
      return json({ error: 'reconnect' }, 409);
    }
    throw error;
  }
}

async function deleteBaseline(req: Request): Promise<Response> {
  const admin = adminClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);
  await removeBaseline(admin, user.id);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  try {
    if (req.method === 'POST' && path.endsWith('/strava-baseline/import')) {
      return await importBaseline(req);
    }
    if (req.method === 'DELETE' && path.endsWith('/strava-baseline'))
      return await deleteBaseline(req);
    return json({ error: 'not_found' }, 404);
  } catch (error) {
    console.error('strava-baseline failed', String(error));
    return json({ error: 'internal' }, 500);
  }
});
