import type { ZwoFile } from './zwift';

/**
 * Zwift Training Connections (CLAUDE.md "Zwift", phase 2): scheduled workouts are pushed straight
 * into the user's Zwift account and appear when Zwift opens. Zwift approves each platform, so the
 * implementation (an Edge Function holding the OAuth tokens) stays behind a feature flag and this
 * interface until Peakr is approved. Completed rides and runs come back through Strava or the
 * watch like every other activity. Types only – no implementation here.
 */

export interface ZwiftScheduledWorkout {
  /** Peakr's workout id: pushing it again updates the same Zwift entry instead of duplicating it. */
  workoutId: string;
  /** Local calendar date the workout is scheduled for (`YYYY-MM-DD`). */
  date: string;
  file: ZwoFile;
}

export type ZwiftPushResult =
  | { ok: true; zwiftId: string }
  | { ok: false; reason: 'notConnected' | 'rejected' | 'unavailable' };

export interface ZwiftProvider {
  /** False until Zwift has approved Peakr; the app then only offers the file export. */
  readonly available: boolean;
  push(workout: ZwiftScheduledWorkout): Promise<ZwiftPushResult>;
  /** Removes a pushed workout (moved, skipped or deleted in the plan). */
  remove(workoutId: string): Promise<void>;
}
