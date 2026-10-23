import {
  allWorkouts,
  statusOf,
  type ElevationPoint,
  type HrZone,
  type PlanState,
  type UserProfile,
} from '@peakr/engine';

import type { WatchWorkout } from '../../../supabase/functions/_shared/watch/model.ts';
import { inWindow } from '../../../supabase/functions/_shared/watch/sync.ts';
import { toWatchWorkouts } from './from-plan';

/** How far ahead Peakr keeps a connected watch in step with the plan. */
export const AUTO_SYNC_DAYS = 14;

export interface PlanSyncInput {
  state: PlanState;
  profile: UserProfile;
  hrZones: readonly HrZone[];
  /** Elevation profiles of the routes workouts are planned on (by route id). */
  routeProfiles?: Readonly<Record<string, readonly ElevationPoint[]>>;
}

/**
 * What a connected watch should hold: the workouts of the next days that are still to do (done and
 * skipped ones are not sent), as neutral watch workouts. Strength, walks and winter sports are left
 * out, a brick becomes two workouts. Comparing this with what was pushed before is what makes a
 * moved workout move on the watch (see `planSync`).
 */
export function plannedWatchWorkouts(
  input: PlanSyncInput,
  today: string,
  days: number = AUTO_SYNC_DAYS,
): WatchWorkout[] {
  const planned = allWorkouts(input.state.plan).filter((w) => statusOf(input.state, w.id) === 'planned');
  const out: WatchWorkout[] = [];
  for (const w of planned) {
    const result = toWatchWorkouts(w, {
      profile: input.profile,
      hrZones: input.hrZones,
      ...(w.routeId && input.routeProfiles?.[w.routeId]
        ? { routeProfile: input.routeProfiles[w.routeId] }
        : {}),
    });
    if (result.ok) out.push(...result.workouts);
  }
  return inWindow(out, today, days);
}
