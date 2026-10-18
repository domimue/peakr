import { planConfig } from './config';
import { deloadSets, progressStrength, resumeWeightKg } from './levels';
import {
  LOWER_BODY_PATTERNS,
  nextVariation,
  resolveExercise,
  type CustomExercise,
} from './library';
import { round1, strengthLoad } from './load';
import { parseReps } from './strength-reps';
import type { LegLoad } from './types';

/** Strength logging (WORKOUTS.md §8.7). */

/** One logged set. Timed exercises log `durationSec` instead of reps. */
export interface SetLog {
  exerciseId: string;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  rpe?: number;
}

export type StrengthLog =
  | {
      kind: 'detailed';
      durationMin: number;
      /** Session RPE; defaults to the mean set RPE. */
      sessionRpe?: number;
      sets: SetLog[];
    }
  | { kind: 'quick'; durationMin: number; rpe: number; legs: boolean };

export interface StrengthLogSummary {
  rpe: number;
  load: number;
  legLoad: LegLoad;
  /** Counts as hard for "no hard days back to back" (heavy legs, §11). */
  hard: boolean;
}

const LEG_ORDER: readonly LegLoad[] = ['none', 'light', 'heavy'];
const DEFAULT_SESSION_RPE = 7;

/**
 * Load and leg load of a logged session, so logged strength counts towards load and spacing
 * (§8.1 "Free / log only"). Quick logs: "legs" → heavy, otherwise light (§8.3). Detailed logs take
 * the heaviest exercise; unknown exercises count as light.
 */
export function summarizeStrengthLog(
  log: StrengthLog,
  custom: readonly CustomExercise[] = [],
): StrengthLogSummary {
  let rpe: number;
  let legLoad: LegLoad;
  if (log.kind === 'quick') {
    rpe = log.rpe;
    legLoad = log.legs ? 'heavy' : 'light';
  } else {
    const rpes = log.sets.flatMap((s) => (s.rpe === undefined ? [] : [s.rpe]));
    rpe =
      log.sessionRpe ??
      (rpes.length > 0
        ? round1(rpes.reduce((a, b) => a + b, 0) / rpes.length)
        : DEFAULT_SESSION_RPE);
    legLoad = log.sets.reduce<LegLoad>((max, s) => {
      const l = resolveExercise(s.exerciseId, custom)?.legLoad ?? 'light';
      return LEG_ORDER.indexOf(l) > LEG_ORDER.indexOf(max) ? l : max;
    }, 'none');
  }
  return {
    rpe,
    load: round1(strengthLoad(log.durationMin, rpe)),
    legLoad,
    hard: legLoad === 'heavy',
  };
}

/** One set to show in the workout screen, pre-filled from last time. */
export interface PlannedSet {
  reps?: number;
  durationSec?: number;
  weightKg?: number;
}

export interface ExercisePrefill {
  exerciseId: string;
  /** Set when a bodyweight exercise moved on to its harder variation. */
  variationOf?: string;
  restSec: number;
  sets: PlannedSet[];
}

export interface PrefillOptions {
  /** Days since the last strength session of this exercise (pause rule §8.5). */
  daysSinceLast?: number;
  /** Recovery week: −40 % sets, same weights. */
  isRecovery?: boolean;
  custom?: readonly CustomExercise[];
}

const cfg = planConfig.strength;

/**
 * Pre-fills the sets of one prescribed exercise from the sets logged last time (§8.5):
 * double progression for weighted exercises (more weight once every set hit the top of the range at
 * RPE ≤ 8, else one more rep), reps then a harder variation for bodyweight exercises,
 * 85 % of the previous weights after a pause and fewer sets in recovery weeks.
 */
export function prefillExercise(
  prescription: {
    exerciseId: string;
    sets: number;
    reps: string;
    restSec: number;
    weightKg?: number;
  },
  last: readonly SetLog[],
  options: PrefillOptions = {},
): ExercisePrefill {
  const range = parseReps(prescription.reps);
  const setCount = options.isRecovery ? deloadSets(prescription.sets) : prescription.sets;
  const paused = (options.daysSinceLast ?? 0) > cfg.resumePauseDays;
  const fill = (set: PlannedSet): PlannedSet[] =>
    Array.from({ length: setCount }, () => ({ ...set }));
  const base = { exerciseId: prescription.exerciseId, restSec: prescription.restSec };

  if (range === null) return { ...base, sets: fill({ weightKg: prescription.weightKg }) };

  if (range.unit === 'sec') {
    const best = Math.max(0, ...last.map((s) => s.durationSec ?? 0));
    const durationSec =
      best > 0 && !paused ? Math.min(range.max, Math.max(range.min, best)) : range.min;
    return { ...base, sets: fill({ durationSec }) };
  }

  const done = last.filter((s) => s.reps !== undefined);
  if (done.length === 0) {
    return {
      ...base,
      sets: fill({ reps: range.min, weightKg: prescription.weightKg }),
    };
  }
  const repsPerSet = done.map((s) => Number(s.reps));
  const weight = Math.max(0, ...done.map((s) => s.weightKg ?? 0));
  const rpes = done.flatMap((s) => (s.rpe === undefined ? [] : [s.rpe]));
  const sessionRpe = rpes.length > 0 ? Math.max(...rpes) : cfg.progression.maxRpe;

  if (weight === 0) {
    // Bodyweight: reps up to the top of the range, then the next harder variation.
    const allTop = repsPerSet.every((r) => r >= range.max);
    const harder = nextVariation(prescription.exerciseId);
    if (allTop && sessionRpe <= cfg.progression.maxRpe && harder && !paused) {
      return {
        ...base,
        exerciseId: harder,
        variationOf: prescription.exerciseId,
        sets: fill({ reps: range.min }),
      };
    }
    const reps = paused
      ? range.min
      : Math.min(range.max, Math.max(range.min, Math.min(...repsPerSet) + 1));
    return { ...base, sets: fill({ reps }) };
  }

  if (paused) {
    return { ...base, sets: fill({ reps: range.min, weightKg: resumeWeightKg(weight) }) };
  }
  const pattern = resolveExercise(prescription.exerciseId, options.custom)?.pattern;
  const next = progressStrength({
    weightKg: weight,
    repRange: range,
    repsPerSet,
    sessionRpe,
    lowerBody: pattern !== undefined && LOWER_BODY_PATTERNS.includes(pattern),
  });
  return { ...base, sets: fill({ reps: next.targetReps, weightKg: next.weightKg }) };
}
