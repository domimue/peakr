/**
 * A finished gym session can go to Strava and to Health Connect / HealthKit. Both copies carry a
 * Peakr marker so the import side (CLAUDE.md "Deduplication") never counts them as new activities:
 * the detailed session already counted in the unified load. Time/duration matching in
 * `isLoggedGymSession` (app) stays as the second line of defence for copies without a marker.
 */

export const GYM_RECORD_PREFIX = 'peakr-gym-';

/** Client record id in Health Connect / HealthKit (upsert key) and Strava `external_id`. */
export function gymRecordId(sessionId: string): string {
  return `${GYM_RECORD_PREFIX}${sessionId}`;
}

/** The slice of a health record we look at (Health Connect `Metadata`). */
export interface HealthRecordOrigin {
  clientRecordId?: string | null;
  /** Package name of the app that wrote the record. */
  dataOrigin?: string | null;
}

/** A record Peakr wrote itself – skipped when reading workouts back. */
export function isOwnHealthRecord(record: HealthRecordOrigin, ownPackage: string): boolean {
  return (
    (record.clientRecordId ?? '').startsWith(GYM_RECORD_PREFIX) ||
    (record.dataOrigin ?? '') === ownPackage
  );
}

export type ShareTarget = 'strava' | 'health';

export type ShareStatus = 'idle' | 'posting' | 'posted' | 'failed' | 'needs_scope';

/** Per session and target: what the UI shows (posting / posted / failed with reason and retry). */
export interface ShareState {
  status: ShareStatus;
  /** Strava activity id or Health Connect record id once done. */
  remoteId?: string;
  /** Machine-readable reason of a failure (see the app's `stravaPost.*` texts). */
  error?: string;
  /** `plain`: the weaker summary-only Strava activity, always shown as such. */
  format?: 'structured' | 'plain';
  /** Epoch ms of the last change. */
  at: number;
}

/** What the user chose for one session; nothing is shared without a `true`. */
export interface ShareChoice {
  strava: boolean;
  health: boolean;
}

export interface ShareSettings {
  /** Defaults for new sessions; both off until the user switches them on. */
  strava: boolean;
  health: boolean;
}

export const DEFAULT_SHARE_SETTINGS: ShareSettings = { strava: false, health: false };

export function parseShareSettings(raw: unknown): ShareSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SHARE_SETTINGS;
  const r = raw as Partial<Record<keyof ShareSettings, unknown>>;
  return { strava: r.strava === true, health: r.health === true };
}

/** The choice offered for a new session: the saved defaults. */
export function defaultChoice(settings: ShareSettings): ShareChoice {
  return { strava: settings.strava, health: settings.health };
}

/** Seconds to wait before poll number `attempt` (0-based): ≥ 1 s (Strava's limit), then backing off. */
export function pollDelaySec(attempt: number): number {
  return [1.5, 2, 3, 5, 8, 12][Math.min(attempt, 5)] ?? 12;
}

/** Give up polling (the state stays "posting" and resumes on the next open) after this many tries. */
export const MAX_POLLS = 12;
