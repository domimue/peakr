import type { ActivitySport, Intensity } from '../plan/types';

import { energyConfig as C } from './config';
import { ageOn, estimateWorkoutKcal, type BodyProfile, type WorkoutEnergyInput } from './energy';

/** A finished activity (Teil A: Strava, watch, Health Connect …). */
export interface CompletedWorkout {
  sport: ActivitySport;
  durationMin: number;
  avgHr?: number | null;
  /** Energy the device reported for this workout, if any. */
  deviceKcal?: number | null;
}

export interface PlannedWorkoutEnergy extends WorkoutEnergyInput {
  status: 'planned' | 'done' | 'skipped';
}

export interface ActiveEnergyInput {
  profile: BodyProfile;
  day: string;
  today: string;
  restingKcal: number;
  /** Whole-day active energy from a wearable (workouts and movement together). */
  wearableActiveKcal?: number | null;
  /** Sum of the workouts' energy from the phone's health store. */
  deviceWorkoutKcal?: number | null;
  completed?: readonly CompletedWorkout[];
  planned?: readonly PlannedWorkoutEnergy[];
  steps?: number | null;
  /** Correction factor for device-reported energy (default 0.8). */
  correction?: number;
}

export interface ActiveEnergy {
  kcal: number;
  workoutKcal: number;
  neatKcal: number;
  workoutSource: 'wearable' | 'device' | 'completed' | 'planned' | 'none';
  neatSource: 'wearable' | 'steps' | 'default';
}

/** Keytel et al.: energy from average heart rate, when it is plausible. */
function keytelKcal(w: CompletedWorkout, profile: BodyProfile, today: string): number | null {
  const hr = w.avgHr;
  const { hrRange } = C.keytel;
  if (hr === null || hr === undefined || hr < hrRange.min || hr > hrRange.max) return null;
  const k = C.keytel[profile.sex];
  const perMin =
    (k.a + k.hr * hr + k.kg * profile.weightKg + k.age * ageOn(profile.birthDate, today)) / 4.184;
  // Positive for every heart rate in the plausible range.
  return Math.round(perMin * w.durationMin);
}

function completedKcal(w: CompletedWorkout, profile: BodyProfile, today: string): number {
  if (w.sport === 'strength') {
    return estimateWorkoutKcal(
      { sport: 'strength', intensity: 'moderate', durationMin: w.durationMin },
      profile.weightKg,
    );
  }
  return (
    keytelKcal(w, profile, today) ??
    estimateWorkoutKcal(
      { sport: w.sport, intensity: 'moderate' as Intensity, durationMin: w.durationMin },
      profile.weightKg,
    )
  );
}

/** Steps taken inside runs and walks, so they are not counted twice as everyday movement. */
function workoutSteps(workouts: readonly { sport: ActivitySport; durationMin: number }[]): number {
  return workouts.reduce((sum, w) => {
    if (w.sport === 'run') return sum + w.durationMin * C.workoutStepsPerMin.run;
    if (w.sport === 'walk') return sum + w.durationMin * C.workoutStepsPerMin.walk;
    return sum;
  }, 0);
}

/**
 * Active energy of one day (CLAUDE.md "Energy & body rules"), in this order:
 * 1. a wearable's whole-day active energy × correction (it already holds workouts and movement);
 * 2. workouts: the health store's workout energy × correction, else the completed activities
 *    estimated (heart rate when known, else MET), else the planned sessions (done ones, and on
 *    today or later the still planned ones);
 * 3. everyday movement: steps when there are any, else the everyday-living share of BMR.
 * Device numbers get the correction; estimates do not (they are not inflated).
 */
export function activeEnergyDay(input: ActiveEnergyInput): ActiveEnergy {
  const correction = input.correction ?? C.deviceActiveShare;
  if (
    input.wearableActiveKcal !== null &&
    input.wearableActiveKcal !== undefined &&
    input.wearableActiveKcal > 0
  ) {
    const kcal = Math.round(input.wearableActiveKcal * correction);
    return { kcal, workoutKcal: 0, neatKcal: 0, workoutSource: 'wearable', neatSource: 'wearable' };
  }

  const completed = input.completed ?? [];
  const planned = (input.planned ?? []).filter(
    (w) => w.status === 'done' || (w.status === 'planned' && input.day >= input.today),
  );
  let workoutKcal = 0;
  let workoutSource: ActiveEnergy['workoutSource'] = 'none';
  let stepWorkouts: readonly { sport: ActivitySport; durationMin: number }[] = completed;
  if (input.deviceWorkoutKcal && input.deviceWorkoutKcal > 0) {
    workoutKcal = Math.round(input.deviceWorkoutKcal * correction);
    workoutSource = 'device';
  } else if (completed.length > 0) {
    workoutKcal = completed.reduce(
      (sum, w) =>
        sum +
        (w.deviceKcal && w.deviceKcal > 0
          ? Math.round(w.deviceKcal * correction)
          : completedKcal(w, input.profile, input.today)),
      0,
    );
    workoutSource = 'completed';
  } else if (planned.length > 0) {
    workoutKcal = planned.reduce(
      (sum, w) => sum + estimateWorkoutKcal(w, input.profile.weightKg),
      0,
    );
    workoutSource = 'planned';
    stepWorkouts = planned;
  }

  let neatKcal: number;
  let neatSource: ActiveEnergy['neatSource'];
  if (input.steps !== null && input.steps !== undefined && input.steps > 0) {
    const steps = Math.max(0, input.steps - workoutSteps(stepWorkouts));
    neatKcal = Math.round(steps * C.kcalPerStepPerKg * input.profile.weightKg);
    neatSource = 'steps';
  } else {
    neatKcal = Math.round(input.restingKcal * (C.dailyLivingFactor - 1));
    neatSource = 'default';
  }
  return { kcal: workoutKcal + neatKcal, workoutKcal, neatKcal, workoutSource, neatSource };
}
