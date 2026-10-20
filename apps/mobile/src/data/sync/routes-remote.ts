import type { ActivitySource, Climb, ElevationPoint, RouteSport, SourceRef } from '@peakr/engine';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { RouteSource } from '../db/schema';
import type { StoredStream, SyncRoute } from '../repositories/route-repository';
import { check, fetchPaged, since } from './remote';

/**
 * Supabase side of the route library (table `routes`, own rows, last write wins) and of the
 * recorded activity streams (table `activity_streams`, written by the Strava import, read-only).
 */

const PUSH_CHUNK = 100;

interface RouteRow {
  id: string;
  name: string;
  sport: RouteSport;
  source: RouteSource;
  distance_m: number;
  gain_m: number;
  loss_m: number;
  start_lat: number;
  start_lon: number;
  polyline: string;
  profile: ElevationPoint[];
  climbs: Climb[];
  source_keys: string[];
  deleted: boolean;
  created_at: string;
  updated_at: string;
  server_updated_at: string;
}

interface StreamRow {
  source: ActivitySource;
  external_id: string;
  distance_m: number[] | null;
  altitude_m: number[] | null;
  time_s: number[] | null;
  heartrate: number[] | null;
  latlng: string | null;
  deleted: boolean;
  server_updated_at: string;
}

const iso = (ms: number) => new Date(ms).toISOString();

function fromRouteRow(row: RouteRow): SyncRoute {
  return {
    id: row.id,
    name: row.name,
    sport: row.sport,
    source: row.source,
    distanceM: row.distance_m,
    gainM: row.gain_m,
    lossM: row.loss_m,
    start: { lat: row.start_lat, lon: row.start_lon },
    polyline: row.polyline,
    profile: row.profile,
    climbs: row.climbs,
    sourceKeys: row.source_keys,
    deleted: row.deleted,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

export async function pushRoutes(
  client: SupabaseClient,
  userId: string,
  list: readonly SyncRoute[],
): Promise<void> {
  for (let i = 0; i < list.length; i += PUSH_CHUNK) {
    const rows = list.slice(i, i + PUSH_CHUNK).map((r) => ({
      user_id: userId,
      id: r.id,
      name: r.name,
      sport: r.sport,
      source: r.source,
      distance_m: r.distanceM,
      gain_m: r.gainM,
      loss_m: r.lossM,
      start_lat: r.start.lat,
      start_lon: r.start.lon,
      polyline: r.polyline,
      profile: r.profile,
      climbs: r.climbs,
      source_keys: r.sourceKeys,
      deleted: r.deleted,
      created_at: iso(r.createdAt),
      updated_at: iso(r.updatedAt),
    }));
    const { error } = await client.from('routes').upsert(rows, { onConflict: 'user_id,id' });
    check(error, 'push routes');
  }
}

export async function pullRoutes(
  client: SupabaseClient,
  cursor: string | null,
): Promise<{ routes: SyncRoute[]; cursor: string | null }> {
  const after = since(cursor);
  const rows = await fetchPaged<RouteRow>(
    (from, to) =>
      client
        .from('routes')
        .select('*')
        .gt('server_updated_at', after)
        .order('server_updated_at')
        .order('id')
        .range(from, to)
        .overrideTypes<RouteRow[], { merge: false }>(),
    'pull routes',
  );
  return { routes: rows.map(fromRouteRow), cursor: newest(rows, cursor) };
}

function newest(rows: readonly { server_updated_at: string }[], cursor: string | null) {
  let out = cursor;
  for (const row of rows) {
    if (!out || Date.parse(row.server_updated_at) > Date.parse(out)) out = row.server_updated_at;
  }
  return out;
}

export async function pullStreams(
  client: SupabaseClient,
  cursor: string | null,
): Promise<{ upserts: StoredStream[]; deletes: SourceRef[]; cursor: string | null }> {
  const after = since(cursor);
  const rows = await fetchPaged<StreamRow>(
    (from, to) =>
      client
        .from('activity_streams')
        .select(
          'source, external_id, distance_m, altitude_m, time_s, heartrate, latlng, deleted, server_updated_at',
        )
        .gt('server_updated_at', after)
        .order('server_updated_at')
        .order('source')
        .order('external_id')
        .range(from, to)
        .overrideTypes<StreamRow[], { merge: false }>(),
    'pull streams',
  );
  const upserts: StoredStream[] = [];
  const deletes: SourceRef[] = [];
  for (const row of rows) {
    const ref = { source: row.source, externalId: row.external_id };
    if (row.deleted || !row.distance_m || !row.altitude_m || !row.time_s) {
      deletes.push(ref);
      continue;
    }
    upserts.push({
      ...ref,
      data: {
        distanceM: row.distance_m,
        altitudeM: row.altitude_m,
        timeS: row.time_s,
        heartrate: row.heartrate,
      },
      latlng: row.latlng,
    });
  }
  return { upserts, deletes, cursor: newest(rows, cursor) };
}
