import type { ActivitySource, ImportedSport, SourceActivity, SourceRef } from '@peakr/engine';
import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchPaged, since } from './remote';

/**
 * Pulls imported activities (table `activities`, written by the Strava webhook, "sync now" and the
 * nightly job). Read-only for the app; Row Level Security returns only the user's own rows.
 */

interface ActivityRow {
  source: ActivitySource;
  external_id: string;
  sport: ImportedSport | null;
  name: string | null;
  start_time: string | null;
  start_date_local: string | null;
  duration_sec: number | null;
  distance_m: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  swim_pace_sec_per_100m: number | null;
  polyline: string | null;
  indoor: boolean;
  commute: boolean;
  summary: boolean;
  rpe: number | null;
  deleted: boolean;
  server_updated_at: string;
}

const COLUMNS = [
  'source, external_id, sport, name, start_time, start_date_local, duration_sec',
  'distance_m, elevation_gain_m, avg_hr, max_hr, swim_pace_sec_per_100m, polyline',
  'indoor, commute, summary, rpe, deleted, server_updated_at',
].join(', ');

export interface ActivityChanges {
  upserts: SourceActivity[];
  /** Deleted at the source or after a disconnect. */
  deletes: SourceRef[];
  cursor: string | null;
}

function fromRow(row: ActivityRow): SourceActivity | null {
  if (row.deleted || !row.sport || !row.start_time || !row.start_date_local) return null;
  if (row.duration_sec === null) return null;
  return {
    source: row.source,
    externalId: row.external_id,
    sport: row.sport,
    startTime: row.start_time,
    date: row.start_date_local,
    durationSec: row.duration_sec,
    distanceM: row.distance_m,
    elevationGainM: row.elevation_gain_m,
    avgHr: row.avg_hr,
    maxHr: row.max_hr,
    swimPaceSecPer100m: row.swim_pace_sec_per_100m,
    polyline: row.polyline,
    name: row.name,
    indoor: row.indoor,
    commute: row.commute,
    summary: row.summary,
    rpe: row.rpe,
  };
}

export async function pullActivities(
  client: SupabaseClient,
  cursor: string | null,
): Promise<ActivityChanges> {
  const after = since(cursor);
  const rows = await fetchPaged<ActivityRow>(
    (from, to) =>
      client
        .from('activities')
        .select(COLUMNS)
        .gt('server_updated_at', after)
        .order('server_updated_at')
        .order('source')
        .order('external_id')
        .range(from, to)
        .overrideTypes<ActivityRow[], { merge: false }>(),
    'pull activities',
  );
  const upserts: SourceActivity[] = [];
  const deletes: SourceRef[] = [];
  let newest = cursor;
  for (const row of rows) {
    const activity = fromRow(row);
    if (activity) upserts.push(activity);
    else deletes.push({ source: row.source, externalId: row.external_id });
    if (!newest || Date.parse(row.server_updated_at) > Date.parse(newest))
      newest = row.server_updated_at;
  }
  return { upserts, deletes, cursor: newest };
}
