import { planConfig } from './config';
import { minutesFor } from './floors';
import { SPORTS, type Experience, type PlanBaseline, type Sport, type UserProfile } from './types';

/**
 * What the user trains now (quiz "Your current training", CLAUDE.md "Current training"): one
 * number per sport – kilometres run, hours ridden and metres swum per week. Entered by the user,
 * or left to Peakr, whose estimate from the level is shown as the starting value.
 */
export interface CurrentTraining {
  runKmPerWeek?: number;
  bikeHoursPerWeek?: number;
  swimMPerWeek?: number;
}

const cfg = planConfig.current;

/** Peakr's estimate of a typical week for this level (the starting value of "I enter it"). */
export function currentTrainingEstimate(
  experience: Experience,
  sports: readonly Sport[],
): CurrentTraining {
  const e = cfg.estimate[experience];
  return {
    ...(sports.includes('run') ? { runKmPerWeek: e.runKm } : {}),
    ...(sports.includes('bike') ? { bikeHoursPerWeek: e.bikeHours } : {}),
    ...(sports.includes('swim') ? { swimMPerWeek: e.swimM } : {}),
  };
}

/** Weekly minutes per sport of the entered training – runs and swims at the athlete's easy pace. */
export function currentWeeklyMinutes(
  profile: UserProfile,
  current: CurrentTraining,
): Partial<Record<Sport, number>> {
  const out: Partial<Record<Sport, number>> = {};
  const add = (sport: Sport, minutes: number | undefined) => {
    if (profile.sports.includes(sport) && minutes !== undefined && minutes > 0)
      out[sport] = Math.round(minutes);
  };
  add('run', current.runKmPerWeek && minutesFor('run', current.runKmPerWeek, profile));
  add('bike', current.bikeHoursPerWeek && current.bikeHoursPerWeek * 60);
  add('swim', current.swimMPerWeek && minutesFor('swim', current.swimMPerWeek / 1000, profile));
  return out;
}

/**
 * The user's own current training as the plan's starting point: week 1 starts at that load, and
 * the start floors hold its weekly minutes per sport. The user's entry wins over a derived value.
 */
export function applyCurrentTraining(profile: UserProfile, current: CurrentTraining): UserProfile {
  const weeklyMin = currentWeeklyMinutes(profile, current);
  if (Object.keys(weeklyMin).length === 0) return profile;
  const { zoneWeights, sportFactors } = planConfig.load;
  const startLoad = SPORTS.reduce(
    (sum, s) => sum + (weeklyMin[s] ?? 0) * zoneWeights[2] * sportFactors[s],
    0,
  );
  const baseline: PlanBaseline = {
    ...profile.baseline,
    weeklyMin: { ...profile.baseline?.weeklyMin, ...weeklyMin },
    startLoad: Math.round(startLoad),
  };
  return { ...profile, baseline };
}
