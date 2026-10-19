import { planConfig } from './config';
import { flattenSteps } from './load';
import { athleteFor, runPaceSecPerKm } from './materialize';
import type { Sport, UserProfile, Workout } from './types';

const cfg = planConfig.distance;

export type SportDistances = Partial<Record<Sport, number>>;

const round1 = (km: number) => Math.round(km * 10) / 10;

/**
 * Estimated distance per discipline of a planned workout (km), from its steps: distance steps
 * count as written, timed steps at the athlete's pace / speed for their zone. Swim rest is
 * standing rest; run and bike recoveries are easy movement. Strength has no distance.
 */
export function workoutDistances(w: Workout, profile: UserProfile): SportDistances {
  if (w.sport !== 'run' && w.sport !== 'bike' && w.sport !== 'swim' && w.sport !== 'brick') {
    return {};
  }
  // Paces and speeds do not depend on the goal.
  const athlete = athleteFor(profile, 'fitness');
  const out: SportDistances = {};
  for (const step of flattenSteps(w.warmup, w.main, w.cooldown)) {
    const sport = (step.sport ?? w.sport) as Sport;
    let km: number;
    if (step.distanceM !== undefined) km = step.distanceM / 1000;
    else {
      const sec = step.durationSec ?? 0;
      const zone = step.rest ? 1 : step.zone;
      if (sport === 'swim') {
        km = step.rest ? 0 : sec / (athlete.cssPacePer100mSec + cfg.swimCssOffset[zone]) / 10;
      } else if (sport === 'bike') {
        const kmh = planConfig.paces.bikeFlatSpeedKmh[athlete.profile.experience];
        km = (sec / 3600) * kmh * cfg.bikeSpeedFactor[zone];
      } else {
        const pace = runPaceSecPerKm(athlete, cfg.runPaceLabel[zone]);
        km = sec / (zone === 1 ? pace * cfg.runZ1Slowdown : pace);
      }
    }
    out[sport] = (out[sport] ?? 0) + km;
  }
  return Object.fromEntries(Object.entries(out).map(([s, km]) => [s, round1(km)]));
}

export interface WeekSummary {
  sessions: number;
  /** Estimated km per discipline. */
  distances: SportDistances;
  minutes: number;
}

/** Sessions, km per discipline and minutes of a list of workouts (e.g. one week). */
export function summarizeWorkouts(workouts: readonly Workout[], profile: UserProfile): WeekSummary {
  const distances: SportDistances = {};
  for (const w of workouts) {
    for (const [sport, km] of Object.entries(workoutDistances(w, profile))) {
      distances[sport as Sport] = round1((distances[sport as Sport] ?? 0) + km);
    }
  }
  return {
    sessions: workouts.length,
    distances,
    minutes: workouts.reduce((sum, w) => sum + w.durationMin, 0),
  };
}
