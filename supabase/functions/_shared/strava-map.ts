/**
 * Strava activity → row of `public.activities` (pure, no Deno APIs, so it can be checked with
 * plain Node too). Only the sports the plan knows are imported; everything else (yoga, …) returns
 * null and is ignored. Weight training comes in as a summary session: Strava has its duration
 * and effort, not its sets, so a detailed log of the same session always wins over it.
 */

export type ImportedSport =
  'run' | 'bike' | 'swim' | 'walk' | 'xcski' | 'skitour' | 'snowshoe' | 'strength';

/** Strava `sport_type` → plan sport. E-bike rides are left out: the motor, not the legs, works. */
const SPORTS: Record<string, ImportedSport> = {
  Run: 'run',
  TrailRun: 'run',
  VirtualRun: 'run',
  Ride: 'bike',
  MountainBikeRide: 'bike',
  GravelRide: 'bike',
  VirtualRide: 'bike',
  Velomobile: 'bike',
  Swim: 'swim',
  Walk: 'walk',
  Hike: 'walk',
  NordicSki: 'xcski',
  BackcountrySki: 'skitour',
  Snowshoe: 'snowshoe',
  WeightTraining: 'strength',
};

/** Fields of Strava's SummaryActivity / DetailedActivity that Peakr uses. */
export interface StravaActivity {
  id: number;
  name?: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  /** Local time, written with a misleading `Z` – only the date part is used. */
  start_date_local: string;
  moving_time: number;
  elapsed_time: number;
  distance?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  has_heartrate?: boolean;
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
  /** 1–10, set by the athlete on Strava ("perceived exertion"). */
  perceived_exertion?: number | null;
  map?: { summary_polyline?: string | null; polyline?: string | null } | null;
}

export interface ActivityRow {
  user_id: string;
  source: 'strava';
  external_id: string;
  sport: ImportedSport;
  source_type: string;
  name: string | null;
  start_time: string;
  start_date_local: string;
  duration_sec: number;
  elapsed_sec: number;
  distance_m: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  swim_pace_sec_per_100m: number | null;
  polyline: string | null;
  indoor: boolean;
  commute: boolean;
  /** Strava has the session but not its content (weight training: no sets). */
  summary: boolean;
  rpe: number | null;
  deleted: false;
}

const positive = (n: number | undefined): number | null =>
  n !== undefined && Number.isFinite(n) && n > 0 ? n : null;

const exertion = (n: number | null | undefined): number | null =>
  n !== undefined && n !== null && Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;

const heartRate = (n: number | undefined): number | null =>
  n !== undefined && Number.isFinite(n) && n >= 20 && n <= 260 ? Math.round(n * 10) / 10 : null;

export function stravaSport(a: Pick<StravaActivity, 'sport_type' | 'type'>): ImportedSport | null {
  return SPORTS[a.sport_type ?? a.type ?? ''] ?? null;
}

export function mapStravaActivity(userId: string, a: StravaActivity): ActivityRow | null {
  const sport = stravaSport(a);
  if (!sport) return null;
  const distance = positive(a.distance);
  const duration = Math.max(0, Math.round(a.moving_time || a.elapsed_time || 0));
  if (duration === 0) return null;
  const polyline = a.map?.polyline || a.map?.summary_polyline || null;
  return {
    user_id: userId,
    source: 'strava',
    external_id: String(a.id),
    sport,
    source_type: (a.sport_type ?? a.type ?? '').slice(0, 64),
    name: a.name ? a.name.slice(0, 300) : null,
    start_time: new Date(a.start_date).toISOString(),
    start_date_local: a.start_date_local.slice(0, 10),
    duration_sec: duration,
    elapsed_sec: Math.max(0, Math.round(a.elapsed_time || duration)),
    distance_m: distance,
    elevation_gain_m:
      a.total_elevation_gain !== undefined && a.total_elevation_gain >= 0
        ? a.total_elevation_gain
        : null,
    avg_hr: a.has_heartrate === false ? null : heartRate(a.average_heartrate),
    max_hr: a.has_heartrate === false ? null : heartRate(a.max_heartrate),
    swim_pace_sec_per_100m:
      sport === 'swim' && distance ? Math.round((duration / (distance / 100)) * 10) / 10 : null,
    polyline,
    indoor: a.trainer === true || a.sport_type?.startsWith('Virtual') === true || !polyline,
    commute: a.commute === true,
    summary: sport === 'strength',
    rpe: exertion(a.perceived_exertion),
    deleted: false,
  };
}
