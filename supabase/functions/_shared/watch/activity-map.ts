import { Decoder, Stream } from '@garmin/fitsdk';

import type { WatchActivityRow } from './model.ts';

/**
 * Activities from watch platforms → rows of `public.activities`, exactly like the Strava mapper
 * (`strava-map.ts`), so the app deduplicates and matches them the same way (Garmin/COROS/Suunto
 * are above Strava in the source priority). Pure: no Deno APIs.
 */

export interface ActivityParts {
  sport: WatchActivityRow['sport'];
  /** The platform's own type name, e.g. `TRAIL_RUNNING`. */
  sourceType: string;
  name: string | null;
  /** Start as an absolute time. */
  startMs: number;
  /** Offset of the user's local time to UTC at the start, in seconds. */
  offsetSec: number;
  durationSec: number;
  elapsedSec?: number | null;
  distanceM: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  indoor: boolean;
  polyline?: string | null;
  commute?: boolean;
}

const positive = (n: number | null | undefined): number | null =>
  n !== null && n !== undefined && Number.isFinite(n) && n > 0 ? n : null;

const heartRate = (n: number | null | undefined): number | null =>
  n !== null && n !== undefined && Number.isFinite(n) && n >= 20 && n <= 260
    ? Math.round(n * 10) / 10
    : null;

export function buildActivityRow(
  source: WatchActivityRow['source'],
  userId: string,
  externalId: string,
  p: ActivityParts,
): WatchActivityRow | null {
  const duration = Math.max(0, Math.round(p.durationSec));
  if (duration === 0 || !Number.isFinite(p.startMs) || externalId === '') return null;
  const distance = positive(p.distanceM);
  const gain = p.elevationGainM !== null && p.elevationGainM >= 0 ? p.elevationGainM : null;
  return {
    user_id: userId,
    source,
    external_id: externalId.slice(0, 64),
    sport: p.sport,
    source_type: p.sourceType.slice(0, 64),
    name: p.name ? p.name.slice(0, 300) : null,
    start_time: new Date(p.startMs).toISOString(),
    // The plan day is the local calendar date of the start.
    start_date_local: new Date(p.startMs + p.offsetSec * 1000).toISOString().slice(0, 10),
    duration_sec: duration,
    elapsed_sec: Math.max(0, Math.round(p.elapsedSec ?? duration)),
    distance_m: distance,
    elevation_gain_m: gain,
    avg_hr: heartRate(p.avgHr),
    max_hr: heartRate(p.maxHr),
    swim_pace_sec_per_100m:
      p.sport === 'swim' && distance ? Math.round((duration / (distance / 100)) * 10) / 10 : null,
    polyline: p.polyline ?? null,
    indoor: p.indoor,
    commute: p.commute === true,
    summary: p.sport === 'strength',
    rpe: null,
    deleted: false,
  };
}

// ---------------------------------------------------------------------------------------------
// FIT activity files (Suunto delivers these; Garmin and COROS offer them as downloads)

/** FIT timestamps count from 1989-12-31T00:00:00Z. */
const FIT_EPOCH_S = 631_065_600;

const FIT_SPORTS: Record<string, WatchActivityRow['sport']> = {
  running: 'run',
  cycling: 'bike',
  eBiking: 'bike',
  swimming: 'swim',
  walking: 'walk',
  hiking: 'walk',
  crossCountrySkiing: 'xcski',
  snowshoeing: 'snowshoe',
  backcountrySkiing: 'skitour',
};

const INDOOR_SUB_SPORTS = new Set([
  'treadmill',
  'indoorRunning',
  'indoorCycling',
  'virtualActivity',
  'lapSwimming',
  'spinning',
]);

/**
 * Reads the first session of a FIT activity file. Sports Peakr does not plan (yoga, golf …)
 * return null. `externalId` is the platform's id of the workout.
 */
export function activityFromFit(
  source: WatchActivityRow['source'],
  userId: string,
  externalId: string,
  bytes: Uint8Array,
): WatchActivityRow | null {
  const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
  if (!Decoder.isFIT(Stream.fromByteArray(Array.from(bytes)))) return null;
  const { messages } = decoder.read();
  const session = (messages.sessionMesgs as Record<string, unknown>[] | undefined)?.[0];
  if (!session) return null;
  const subSport = String(session.subSport ?? '');
  const sportName = String(session.sport ?? '');
  const sport =
    sportName === 'training' && subSport === 'strengthTraining' ? 'strength' : FIT_SPORTS[sportName];
  if (!sport) return null;
  const start = session.startTime instanceof Date ? session.startTime.getTime() : NaN;
  const activity = (messages.activityMesgs as Record<string, unknown>[] | undefined)?.[0];
  // `localTimestamp` is a plain FIT number (seconds since 1989-12-31, in the user's local time);
  // its difference to the UTC `timestamp` is the offset at the end of the activity.
  const offsetSec =
    typeof activity?.localTimestamp === 'number' && activity.timestamp instanceof Date
      ? Math.round(activity.localTimestamp - (activity.timestamp.getTime() / 1000 - FIT_EPOCH_S))
      : 0;
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  return buildActivityRow(source, userId, externalId, {
    sport,
    sourceType: subSport && subSport !== 'generic' ? subSport : sportName,
    name: null,
    startMs: start,
    offsetSec,
    durationSec: num(session.totalTimerTime) ?? num(session.totalElapsedTime) ?? 0,
    elapsedSec: num(session.totalElapsedTime),
    distanceM: num(session.totalDistance),
    elevationGainM: num(session.totalAscent),
    avgHr: num(session.avgHeartRate),
    maxHr: num(session.maxHeartRate),
    indoor: INDOOR_SUB_SPORTS.has(subSport) || num(session.startPositionLat) === null,
  });
}
