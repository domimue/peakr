/**
 * Provider-neutral model of what Peakr sends to a watch platform and what comes back (CLAUDE.md
 * "Watch integrations"). Pure TypeScript without Deno or engine imports, so the same file runs in
 * the Edge Functions, in the app and in the tests. Every provider (Garmin, COROS, Suunto, the file
 * export) translates from this model; none of them sees the plan engine's own types.
 */

export type WatchProviderId = 'garmin' | 'coros' | 'suunto' | 'apple' | 'file';

/** The choices of the watch picker, in display order. `file` is "Other watch". */
export const WATCH_CHOICES: readonly WatchProviderId[] = [
  'garmin',
  'coros',
  'suunto',
  'apple',
  'file',
];

export type WatchSport = 'run' | 'bike' | 'swim';
export const WATCH_SPORTS: readonly WatchSport[] = ['run', 'bike', 'swim'];

export type WatchIntensity = 'warmup' | 'active' | 'interval' | 'recovery' | 'rest' | 'cooldown';

/** What the watch shows as the target of a step. Absolute values: the zones are already resolved. */
export type WatchTarget =
  | { type: 'open' }
  | { type: 'heartRate'; lowBpm: number; highBpm: number }
  /** Run pace, seconds per km (fastest is the smaller number). */
  | { type: 'pace'; fastestSecPerKm: number; slowestSecPerKm: number }
  /** Swim pace, seconds per 100 m. */
  | { type: 'swimPace'; fastestSecPer100m: number; slowestSecPer100m: number };

export interface WatchStep {
  kind: 'step';
  intensity: WatchIntensity;
  /** At most one of the two; neither = open step (ends with the lap button). */
  durationSec?: number;
  distanceM?: number;
  target: WatchTarget;
  /** Short name shown on the watch (max 32 characters), e.g. "Warm-up" or "km 3". */
  name?: string;
  /** One line of explanation. */
  note?: string;
}

export interface WatchRepeat {
  kind: 'repeat';
  count: number;
  steps: WatchStep[];
}

export type WatchNode = WatchStep | WatchRepeat;

export interface WatchWorkout {
  /** Stable id of the planned workout – the key of re-syncing (update instead of duplicate). */
  id: string;
  /** ISO date the workout is planned for. */
  date: string;
  name: string;
  sport: WatchSport;
  /** Pool swims: 25 or 50 (metres). Open water and every other sport: absent. */
  poolLengthM?: 25 | 50;
  steps: WatchNode[];
  description?: string;
}

export interface WatchRoutePoint {
  lat: number;
  lon: number;
  ele: number | null;
}

/** A route to publish as a course on the watch. */
export interface WatchRoute {
  id: string;
  name: string;
  sport: 'run' | 'bike';
  points: WatchRoutePoint[];
}

/** An activity delivered by a watch platform, as the import pipeline stores it. */
export interface WatchActivityRow {
  user_id: string;
  source: 'garmin' | 'coros' | 'suunto';
  external_id: string;
  sport: 'run' | 'bike' | 'swim' | 'walk' | 'xcski' | 'skitour' | 'snowshoe' | 'strength';
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
  summary: boolean;
  rpe: number | null;
  deleted: false;
}

export type WatchFailure =
  /** The user has not connected this platform (or the connection expired). */
  | 'not_connected'
  /** Feature flag off: the partner programme has not approved Peakr yet. */
  | 'not_available'
  /** The platform cannot take this (e.g. strength workouts, a sport it lacks). */
  | 'unsupported'
  | 'rate_limited'
  /** The platform refused the payload; `detail` has its message. */
  | 'rejected'
  | 'network';

export interface PushItem {
  /** `WatchWorkout.id` or `WatchRoute.id`. */
  id: string;
  ok: boolean;
  /** The id at the platform, kept for updates and removals. */
  externalId?: string;
  failure?: WatchFailure;
  detail?: string;
}

export type PushResult =
  | { ok: true; items: PushItem[] }
  | { ok: false; failure: WatchFailure; detail?: string };

export interface ImportedActivities {
  /** Activities as rows for the shared import pipeline (deduplication happens in the app). */
  rows: WatchActivityRow[];
  /** External ids of activities the platform reports as deleted. */
  deleted: string[];
}

export type ImportResult =
  | ({ ok: true } & ImportedActivities)
  | { ok: false; failure: WatchFailure; detail?: string };

export interface WatchCapabilities {
  /** Structured workouts can be pushed to the watch. */
  workouts: boolean;
  /** Routes / courses can be pushed to the watch. */
  routes: boolean;
  /** Completed activities arrive automatically. */
  activities: boolean;
  /** Sports whose structured workouts the platform accepts. */
  sports: readonly WatchSport[];
  /** Strength sessions are never pushed (shown in the app only). */
  strength: false;
}

/**
 * The contract of every watch platform (CLAUDE.md "Watch integrations"). Implemented server-side
 * by `RemoteWatchProvider` (Garmin, COROS, Suunto through their Edge Functions) and on the device
 * by the file export, the universal fallback for every brand.
 */
export interface WatchProvider {
  readonly id: WatchProviderId;
  readonly capabilities: WatchCapabilities;
  pushWorkouts(workouts: readonly WatchWorkout[]): Promise<PushResult>;
  pushRoute(route: WatchRoute): Promise<PushResult>;
  importActivities(since: Date): Promise<ImportResult>;
  disconnect(): Promise<void>;
}

/** Seconds per km → m/s. */
export const speedFromPace = (secPerKm: number): number => 1000 / secPerKm;
/** Seconds per 100 m → m/s. */
export const speedFromSwimPace = (secPer100m: number): number => 100 / secPer100m;

/** Names on watches are short; keep them readable and safe for every platform. */
export function watchName(name: string, max = 32): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
