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
}

export type BodyProfileField = 'sex' | 'birthDate' | 'heightCm' | 'weightKg';

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
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: input as BodyProfile };
}

export interface RestingEnergy {
  kcal: number;
  method: 'mifflin' | 'katch';
}

/** A dated measurement (body fat %, weight …). */
export interface Measurement {
  day: string;
  value: number;
}

const DAY_MS = 86_400_000;
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** The latest plausible body fat % of the last 30 days, or null (then Mifflin-St Jeor applies). */
export function recentBodyFat(
  measurements: readonly Measurement[],
  today: string,
): Measurement | null {
  const { min, max } = C.limits.bodyFatPct;
  const recent = measurements
    .filter((m) => m.value >= min && m.value <= max && m.day <= today)
    .filter((m) => daysBetween(m.day, today) <= C.bodyFatMaxAgeDays)
    .sort((a, b) => a.day.localeCompare(b.day));
  return recent.at(-1) ?? null;
}

/**
 * Resting energy (BMR): Katch-McArdle when a body fat % from the last 30 days exists, else
 * Mifflin-St Jeor. A device's own resting energy, when there is one, wins over both (see
 * `pickBySource`); this is the estimate.
 */
export function restingEnergy(
  profile: BodyProfile,
  today: string,
  bodyFat: Measurement | null = null,
): RestingEnergy {
  if (bodyFat) {
    const lean = profile.weightKg * (1 - bodyFat.value / 100);
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
  bodyFat?: Measurement | null;
  /** Everyday-activity factor (`everydayFactor`); default: the desk-job factor. */
  everydayFactor?: number;
}): EnergyToday {
  const resting = restingEnergy(input.profile, input.today, input.bodyFat ?? null).kcal;
  const factor = input.everydayFactor ?? C.everydayActivity[C.defaultEverydayActivity];
  const base = Math.round(resting * factor);
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
