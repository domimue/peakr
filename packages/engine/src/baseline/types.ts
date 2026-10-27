import type { HrZone } from '../hr';
import type { Experience, Sport, Terrain } from '../plan/types';

/**
 * A recent activity read once to calibrate the plan (CLAUDE.md "Baseline from past activities").
 * Reference data only: deliberately not a `SourceActivity`, so it can never be matched to a
 * planned workout, absorbed into a week or shown as history.
 */
export interface BaselineActivity {
  externalId: string;
  sport: Sport;
  /** Local start date (YYYY-MM-DD). */
  date: string;
  /** Moving time. */
  durationSec: number;
  distanceM: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  /** Trainer, treadmill, virtual or no GPS track. */
  indoor: boolean;
  /** Entered by hand on Strava (no device data). */
  manual: boolean;
  /** Marked as a race on Strava. */
  race: boolean;
  /** Best 20-minute average HR from the HR stream, when it was read. */
  best20MinHr: number | null;
}

/** A derived value, or "not enough data" with how many activities were usable and needed. */
export type Derived<T> =
  | { status: 'ok'; value: T; count: number }
  | { status: 'notEnoughData'; count: number; needed: number };

export interface SportVolume {
  weeklyMin: number;
  weeklyKm: number;
  sessionsPerWeek: number;
  longestMin: number;
  /**
   * Typical long session (the plan's starting long session): the median of this person's long
   * sessions (`classifyBaseline`) of the last six weeks; without any, the median longest session
   * per week.
   */
  longMin: number;
  /** Distance of the typical long session (null without distances, e.g. trainer rides). */
  longKm: number | null;
  /** How many long sessions `longMin` comes from (0 = fallback to the longest per week). */
  longSessions: number;
  /** Plain mean of the last four full weeks – the week-1 volume floor. */
  recentWeeklyMin: number;
  recentWeeklyKm: number;
}

export interface SportBaseline {
  sport: Sport;
  activities: number;
  volume: Derived<SportVolume>;
  /** Starting level class (WORKOUTS.md §10). */
  experience: Derived<Experience>;
  /** Run and bike only. */
  terrain: Derived<{ gainPerKm: number; terrain: Terrain }> | null;
}

export interface PaceHrRelation {
  /** Seconds per km per bpm (negative: faster at a higher HR). */
  slopeSecPerKmPerBpm: number;
  referenceHr: number;
  /** Grade-adjusted pace at `referenceHr` (top of Zone 2 when zones are known). */
  paceAtReferenceSecPerKm: number;
}

export interface BaselineResult {
  /** Selected activities inside the window. */
  activities: number;
  /** Full weeks covered by the selection. */
  weeks: number;
  sports: SportBaseline[];
  /** Typical grade-adjusted easy pace. */
  easyPaceSecPerKm: Derived<number>;
  paceHr: Derived<PaceHrRelation>;
  /** Observed HRmax (a lower bound: the true value may be higher). */
  hrMax: Derived<number>;
  lthr: Derived<number>;
  /** Estimate only; the 400/200 test is more accurate. */
  cssPacePer100mSec: Derived<number>;
  /** Current weekly load (unified load model): week 1 starts here. */
  weeklyLoad: Derived<number>;
  /** Zones the user set on Strava themselves (`custom_zones`); null otherwise. */
  stravaHrZones: HrZone[] | null;
}
