import { planConfig } from '../plan/config';
import { workoutDistances } from '../plan/distance';
import { flattenSteps } from '../plan/load';
import { athleteFor, runPaceSecPerKm } from '../plan/materialize';
import {
  estimateRunDurationSec,
  perKmPacePlan,
  routeSegments,
  type ElevationPoint,
  type PaceSegment,
} from '../plan/terrain';
import type { Experience, UserProfile, Workout } from '../plan/types';
import type { ZoneNumber } from '../zones';

/**
 * A planned session on a concrete route: expected duration and the per-km pace plan
 * (CLAUDE.md "Grade-adjusted pace (GAP)" and "Duration estimate").
 */

const bikeCfg = planConfig.routes.bike;

export type RouteSport = 'run' | 'bike';

/** The pace the main set is run at on the flat (s/km): its pace label, else its zone's pace. */
export function mainSetFlatPace(w: Workout, profile: UserProfile): number {
  const athlete = athleteFor(profile, 'fitness');
  if (w.paceMode === 'limit') return runPaceSecPerKm(athlete, 'E');
  const work = flattenSteps([], w.main, []).filter((s) => !s.rest);
  const label = work
    .map((s) => {
      if (s.target.kind === 'paceZone') return s.target.value;
      return s.hint?.kind === 'paceZone' ? s.hint.value : null;
    })
    .find((v) => v !== null);
  const zone = Math.max(1, ...work.map((s) => s.zone)) as ZoneNumber;
  return runPaceSecPerKm(athlete, label ?? planConfig.distance.runPaceLabel[zone]);
}

/**
 * Per-km pace plan of a run on a route. Tempo, intervals and races: pace is the primary target.
 * Easy / Zone 2 / long runs: HR stays primary and the pace is guidance ("no faster than").
 */
export function routePacePlan(
  w: Workout,
  profile: readonly ElevationPoint[],
  user: UserProfile,
): PaceSegment[] {
  return perKmPacePlan(profile, mainSetFlatPace(w, user), w.paceMode === 'target');
}

/** Average flat speed of the planned session: its flat distance over its duration (km/h). */
export function sessionFlatSpeedKmh(w: Workout, user: UserProfile, sport: RouteSport): number {
  const km = workoutDistances(w, user)[sport] ?? 0;
  if (km > 0 && w.durationMin > 0) return km / (w.durationMin / 60);
  /* v8 ignore next 3 -- every planned run/ride has distance; defensive fallback */
  return sport === 'bike'
    ? planConfig.paces.bikeFlatSpeedKmh[user.experience]
    : 3600 / runPaceSecPerKm(athleteFor(user, 'fitness'), 'E');
}

/**
 * Riding time of a route: flat speed on the flat, climbs limited by a sustainable climbing rate,
 * descents faster up to a cap.
 */
export function estimateBikeRouteDurationSec(
  profile: readonly ElevationPoint[],
  flatSpeedKmh: number,
  experience: Experience,
): number {
  return routeSegments(profile).reduce((sum, s) => {
    const km = (s.endM - s.startM) / 1000;
    let speed = flatSpeedKmh;
    if (s.gradient > 0) {
      speed = Math.min(flatSpeedKmh, bikeCfg.climbRateMh[experience] / (s.gradient * 1000));
    } else if (s.gradient < 0) {
      speed = Math.min(
        bikeCfg.maxDescentKmh,
        flatSpeedKmh * (1 + -s.gradient * bikeCfg.descentSpeedupPerGradient),
      );
    }
    return sum + (km / speed) * 3600;
  }, 0);
}

/** Expected duration of the planned session on a route, in seconds. */
export function estimateSessionOnRouteSec(
  w: Workout,
  sport: RouteSport,
  profile: readonly ElevationPoint[],
  user: UserProfile,
): number {
  const speed = sessionFlatSpeedKmh(w, user, sport);
  return sport === 'run'
    ? estimateRunDurationSec(profile, 3600 / speed)
    : estimateBikeRouteDurationSec(profile, speed, user.experience);
}
