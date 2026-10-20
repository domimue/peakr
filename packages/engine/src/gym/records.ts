import type { GymSet } from './types';

/**
 * Personal records per exercise. Only completed sets that are not warm-ups count. A record needs
 * earlier history: the first time an exercise is logged sets the baseline, it is not a record, and
 * matching the previous best is not a new one either.
 */

export type RecordKind = 'weight' | 'oneRm' | 'setVolume' | 'reps' | 'duration' | 'distance';

export const RECORD_KINDS: readonly RecordKind[] = [
  'weight',
  'oneRm',
  'setVolume',
  'reps',
  'duration',
  'distance',
];

export type ExerciseBests = Partial<Record<RecordKind, number>>;

export interface PersonalRecord {
  exerciseId: string;
  kind: RecordKind;
  value: number;
  previous: number;
  /** The set that set the record. */
  setId: string;
}

/** Epley estimate; only up to this many reps (the estimate gets unreliable above). */
const ONE_RM_MAX_REPS = 12;

export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** Whether a set counts for volume, totals and records. */
export function countsAsWork(set: GymSet): boolean {
  return set.completed && set.setType !== 'warmup';
}

/** Record values of one set (only the kinds the set has data for). */
export function setValues(set: GymSet): ExerciseBests {
  const out: ExerciseBests = {};
  const weight = set.weightKg ?? 0;
  const reps = set.reps ?? 0;
  if (weight > 0) out.weight = weight;
  if (weight > 0 && reps > 0) {
    out.setVolume = weight * reps;
    if (reps <= ONE_RM_MAX_REPS) out.oneRm = estimateOneRepMax(weight, reps);
  }
  // Reps are a record only without added weight; with weight they belong to volume / 1RM.
  if (weight === 0 && reps > 0) out.reps = reps;
  if ((set.durationSec ?? 0) > 0) out.duration = set.durationSec;
  if ((set.distanceM ?? 0) > 0) out.distance = set.distanceM;
  return out;
}

/** Best value per record kind and exercise over the given sets. */
export function bestsByExercise(sets: readonly GymSet[]): Map<string, ExerciseBests> {
  const bests = new Map<string, ExerciseBests>();
  for (const set of sets) {
    if (!countsAsWork(set)) continue;
    const current = bests.get(set.exerciseId) ?? {};
    for (const [kind, value] of Object.entries(setValues(set)) as [RecordKind, number][]) {
      if (value > (current[kind] ?? 0)) current[kind] = value;
    }
    bests.set(set.exerciseId, current);
  }
  return bests;
}

/**
 * Records set in a session, compared against all earlier sets. Per exercise and kind only the best
 * set of the session is reported.
 */
export function findNewRecords(
  sessionSets: readonly GymSet[],
  history: readonly GymSet[],
): PersonalRecord[] {
  const before = bestsByExercise(history);
  const best = new Map<string, PersonalRecord>();
  for (const set of sessionSets) {
    if (!countsAsWork(set)) continue;
    const previous = before.get(set.exerciseId);
    if (!previous) continue;
    for (const [kind, value] of Object.entries(setValues(set)) as [RecordKind, number][]) {
      const prev = previous[kind];
      if (prev === undefined || value <= prev) continue;
      const key = `${set.exerciseId}|${kind}`;
      const seen = best.get(key);
      if (!seen || value > seen.value) {
        best.set(key, { exerciseId: set.exerciseId, kind, value, previous: prev, setId: set.id });
      }
    }
  }
  return [...best.values()].sort(
    (a, b) =>
      a.exerciseId.localeCompare(b.exerciseId) ||
      RECORD_KINDS.indexOf(a.kind) - RECORD_KINDS.indexOf(b.kind),
  );
}
