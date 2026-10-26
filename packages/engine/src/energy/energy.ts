import { estimateStrengthKcal } from '../gym/energy';
import type { ActivitySport, Intensity } from '../plan/types';
import { checkRange, type Range, type Result, type ValidationIssue } from '../result';

import { energyConfig as C } from './config';

/**
 * Energy maths of the Body add-on (CLAUDE.md "Energy & body rules"). Every value here is an
 * estimate and the UI labels it as one; nothing in the app computes energy by itself.
 */

export type BodySex = 'female' | 'male';

/** The shared profile values the add-on needs (CLAUDE.md "Add-on rules": one profile). */
export interface BodyProfile {
  sex: BodySex;
  /** ISO date (YYYY-MM-DD). */
  birthDate: string;
  heightCm: number;
  /** Smoothed trend weight, never a single weigh-in. */
  weightKg: number;
  bodyFatPct?: number;
}

export type BodyProfileField = 'sex' | 'birthDate' | 'heightCm' | 'weightKg' | 'bodyFatPct';

/** Full years between the birth date and `onDate` (both ISO dates). */
export function ageOn(birthDate: string, onDate: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = onDate.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Which of the profile values are missing or out of range (asked inline in the add-on). */
export function validateBodyProfile(
  input: Partial<BodyProfile>,
  today: string,
): Result<BodyProfile, BodyProfileField> {
  const issues: ValidationIssue<BodyProfileField>[] = [];
  const range = (field: BodyProfileField, value: number | undefined, r: Range) => {
    if (value === undefined) issues.push({ field, code: 'required' });
    else checkRange(issues, field, value, r);
  };
  if (input.sex !== 'female' && input.sex !== 'male')
    issues.push({ field: 'sex', code: 'required' });
  if (!input.birthDate || !ISO_DATE.test(input.birthDate)) {
    issues.push({ field: 'birthDate', code: 'required' });
  } else {
    checkRange(issues, 'birthDate', ageOn(input.birthDate, today), C.limits.age);
  }
  range('heightCm', input.heightCm, C.limits.heightCm);
  range('weightKg', input.weightKg, C.limits.weightKg);
  checkRange(issues, 'bodyFatPct', input.bodyFatPct, C.limits.bodyFatPct);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: input as BodyProfile };
}

export interface RestingEnergy {
  kcal: number;
  method: 'mifflin' | 'katch';
}

/** Resting energy (BMR): Katch-McArdle when body fat % is known, else Mifflin-St Jeor. */
export function restingEnergy(profile: BodyProfile, today: string): RestingEnergy {
  if (profile.bodyFatPct !== undefined) {
    const lean = profile.weightKg * (1 - profile.bodyFatPct / 100);
    return { kcal: Math.round(C.katch.intercept + C.katch.perLeanKg * lean), method: 'katch' };
  }
  const m = C.mifflin;
  const kcal =
    m.kg * profile.weightKg +
    m.cm * profile.heightCm -
    m.age * ageOn(profile.birthDate, today) +
    m.offset[profile.sex];
  return { kcal: Math.round(kcal), method: 'mifflin' };
}

/** Lowest intake target the engine ever proposes: max(BMR, 1,200 kcal women / 1,500 kcal men). */
export function intakeFloorKcal(sex: BodySex, bmrKcal: number): number {
  return Math.max(Math.round(bmrKcal), C.intakeFloorKcal[sex]);
}

export interface WorkoutEnergyInput {
  sport: ActivitySport;
  intensity: Intensity;
  durationMin: number;
  /** Strength only: session RPE. */
  rpe?: number;
}

/** Estimated energy of a workout from duration, intensity and body weight (MET × kg × hours). */
export function estimateWorkoutKcal(workout: WorkoutEnergyInput, weightKg?: number): number {
  if (!(workout.durationMin > 0)) return 0;
  const kg = weightKg ?? C.defaultBodyWeightKg;
  if (workout.sport === 'strength') {
    return estimateStrengthKcal(workout.durationMin, { rpe: workout.rpe, bodyWeightKg: kg });
  }
  const met = C.met[workout.sport][workout.intensity];
  return Math.round(met * kg * (workout.durationMin / 60));
}

/** One workout's energy for the day: a device value (counted at 75 %) or the estimate. */
export interface WorkoutEnergy {
  kcal: number;
  source: 'device' | 'estimate';
}

export function countedWorkoutKcal(
  w: WorkoutEnergy,
  deviceShare: number = C.deviceActiveShare,
): number {
  return Math.round(w.source === 'device' ? w.kcal * deviceShare : w.kcal);
}

export interface EnergyToday {
  restingKcal: number;
  /** Resting energy plus everyday movement (without workouts). */
  baseKcal: number;
  workoutKcal: number;
  /** Intake target for today: base + workouts − planned deficit, never below the floor. */
  targetKcal: number;
  intakeKcal: number;
  /** Target − intake (negative when above the target). */
  remainingKcal: number;
  /** The safety floor raised the target. */
  floorApplied: boolean;
}

/**
 * "Energy today": what is left of today's target after what was eaten, with the energy of today's
 * workouts added. `deficitKcal` comes from the weight goal (0 = maintain); the floor always wins.
 */
export function energyToday(input: {
  profile: BodyProfile;
  today: string;
  workouts: readonly WorkoutEnergy[];
  intakeKcal: number;
  deficitKcal?: number;
}): EnergyToday {
  const resting = restingEnergy(input.profile, input.today).kcal;
  const base = Math.round(resting * C.dailyLivingFactor);
  const workoutKcal = input.workouts.reduce((sum, w) => sum + countedWorkoutKcal(w), 0);
  const wanted = base + workoutKcal - Math.max(0, input.deficitKcal ?? 0);
  const floor = intakeFloorKcal(input.profile.sex, resting);
  const targetKcal = Math.max(wanted, floor);
  const intakeKcal = Math.round(Math.max(0, input.intakeKcal));
  return {
    restingKcal: resting,
    baseKcal: base,
    workoutKcal,
    targetKcal,
    intakeKcal,
    remainingKcal: targetKcal - intakeKcal,
    floorApplied: wanted < floor,
  };
}

export interface WeighIn {
  date: string;
  weightKg: number;
}

export interface TrendPoint {
  date: string;
  weightKg: number;
  trendKg: number;
}

/**
 * Exponentially smoothed weight trend (one point per day; several weigh-ins on one day are
 * averaged). The trend is what the calculations use – a single weigh-in is water and glycogen.
 */
export function weightTrend(
  weighIns: readonly WeighIn[],
  alpha: number = C.trendAlpha,
): TrendPoint[] {
  const byDay = new Map<string, number[]>();
  for (const w of weighIns) {
    if (!Number.isFinite(w.weightKg) || w.weightKg <= 0) continue;
    byDay.set(w.date, [...(byDay.get(w.date) ?? []), w.weightKg]);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const points: TrendPoint[] = [];
  let trend: number | null = null;
  for (const [date, values] of days) {
    const weight = values.reduce((a, b) => a + b, 0) / values.length;
    trend = trend === null ? weight : trend + alpha * (weight - trend);
    points.push({
      date,
      weightKg: Math.round(weight * 10) / 10,
      trendKg: Math.round(trend * 10) / 10,
    });
  }
  return points;
}

/** The latest trend weight, or null without weigh-ins. */
export function trendWeightKg(weighIns: readonly WeighIn[]): number | null {
  return weightTrend(weighIns).at(-1)?.trendKg ?? null;
}
