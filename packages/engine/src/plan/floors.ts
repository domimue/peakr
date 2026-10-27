import { zoneConfig } from '../config';
import { planConfig } from './config';
import {
  SPORTS,
  type Plan,
  type PlanWeek,
  type Sport,
  type UserProfile,
  type Workout,
} from './types';

const cfg = planConfig.floors;

/**
 * Hard floors of a new plan (CLAUDE.md "Baseline"): it never starts below what the athlete
 * demonstrably does – independent of any statistics. Sources: the Strava baseline (typical long
 * session, mean weekly minutes of the last four weeks) and the quiz answer "longest session of
 * the last weeks". The higher source wins.
 */
export interface StartFloors {
  /** First long session at least this long (minutes). */
  longMin: Partial<Record<Sport, number>>;
  /** Week-1 minutes per sport at least this much (for a full week). */
  weeklyMin: Partial<Record<Sport, number>>;
}

/** Easy pace (s/km) from the threshold pace, else the default speed. */
export function minutesFor(sport: Sport, km: number, profile: UserProfile): number {
  if (sport === 'run' && profile.thresholdPaceSecPerKm !== undefined) {
    // Easy pace sits in the middle of the Z2 pace band (as in `thresholdFromEasyPace`).
    const [slow, fast] = zoneConfig.run.paceZoneBoundaries;
    return (km * profile.thresholdPaceSecPerKm * ((slow + fast) / 2)) / 60;
  }
  if (sport === 'swim' && profile.cssPacePer100mSec !== undefined) {
    // Long swims are easy: about 10 s per 100 m slower than CSS.
    return (km * 10 * (profile.cssPacePer100mSec + 10)) / 60;
  }
  return (km / cfg.defaultSpeedKmh[sport]) * 60;
}

export function startFloors(profile: UserProfile): StartFloors {
  const longMin: Partial<Record<Sport, number>> = {};
  const weeklyMin: Partial<Record<Sport, number>> = {};
  for (const sport of SPORTS) {
    if (!profile.sports.includes(sport)) continue;
    const quiz = profile.recentLongest?.[sport];
    const fromQuiz =
      quiz?.min ?? (quiz?.km !== undefined ? minutesFor(sport, quiz.km, profile) : undefined);
    const typical = Math.max(profile.baseline?.longMin?.[sport] ?? 0, fromQuiz ?? 0);
    if (typical > 0) longMin[sport] = Math.round((typical * cfg.longShare) / 5) * 5;
    const weekly = profile.baseline?.weeklyMin?.[sport];
    if (weekly !== undefined && weekly > 0) weeklyMin[sport] = Math.round(weekly * cfg.volumeShare);
  }
  return { longMin, weeklyMin };
}

/** A start below a floor – the plan is not shipped; the issue says which and by how much. */
export interface FloorBreach {
  sport: Sport;
  kind: 'long' | 'volume';
  plannedMin: number;
  floorMin: number;
}

/** Minutes of a sport in a set of sessions (a brick is half ride, half run). */
export const sportMinutes = (workouts: readonly Workout[], sport: Sport) =>
  workouts
    .filter((x) => x.sport === sport || (x.sport === 'brick' && sport !== 'swim'))
    .reduce((s, x) => s + (x.sport === 'brick' ? x.durationMin / 2 : x.durationMin), 0);
const minutesOf = (w: PlanWeek, sport: Sport) => sportMinutes(w.workouts, sport);

/**
 * Checks the start of a generated plan against the floors: the first long session of each sport
 * (in the first two weeks) and the volume of the first full-enough week (four or more plan days;
 * a shorter first week is scaled).
 */
export function checkStartFloors(plan: Plan, floors: StartFloors): FloorBreach[] {
  const breaches: FloorBreach[] = [];
  const firstWeeks = plan.weeks.slice(0, 2);
  for (const sport of SPORTS) {
    const longFloor = floors.longMin[sport];
    if (longFloor !== undefined) {
      const first = firstWeeks
        .flatMap((w) => w.workouts)
        .find((x) => x.role === 'long' && x.sport === sport);
      if (first && first.durationMin < longFloor)
        breaches.push({ sport, kind: 'long', plannedMin: first.durationMin, floorMin: longFloor });
    }
    const volFloor = floors.weeklyMin[sport];
    if (volFloor !== undefined) {
      // A first week of fewer than four plan days says little: the second week is checked.
      const days = firstWeekDays(plan);
      const second = days < 4 ? plan.weeks[1] : undefined;
      const week = second ?? (plan.weeks[0] as PlanWeek);
      const needed = Math.round((volFloor * (second ? 7 : days)) / 7);
      const planned = Math.round(minutesOf(week, sport));
      if (planned < needed)
        breaches.push({ sport, kind: 'volume', plannedMin: planned, floorMin: needed });
    }
  }
  return breaches;
}

/** Plan days of the first week: from the start date to Sunday. */
function firstWeekDays(plan: Plan): number {
  const start = new Date(`${plan.startDate}T00:00:00Z`).getUTCDay();
  return 7 - ((start + 6) % 7);
}
