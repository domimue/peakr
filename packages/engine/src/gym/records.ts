import type { GymSet } from './types';

/**
 * Personal records per exercise. Only completed sets that are not warm-ups count. A record needs
 * earlier history: the first time an exercise is logged sets the baseline, it is not a record, and
 * matching the previous best is not a new one either.
 */

/**
 * Per set, plus `sessionVolume` (Σ weight × reps of the exercise in one session) and `repsAtWeight`
 * (more reps than ever at a weight that was lifted before).
 */
export type RecordKind =
  | 'weight'
  | 'oneRm'
  | 'setVolume'
  | 'sessionVolume'
  | 'repsAtWeight'
  | 'reps'
  | 'duration'
  | 'distance';

export const RECORD_KINDS: readonly RecordKind[] = [
  'weight',
  'oneRm',
  'setVolume',
  'sessionVolume',
  'repsAtWeight',
  'reps',
  'duration',
  'distance',
];

type SetRecordKind = Exclude<RecordKind, 'sessionVolume' | 'repsAtWeight'>;

export type ExerciseBests = Partial<Record<SetRecordKind, number>>;

export interface PersonalRecord {
  exerciseId: string;
  kind: RecordKind;
  value: number;
  previous: number;
  /** The set that set the record (for `sessionVolume` the session's last set of the exercise). */
  setId: string;
  /** `repsAtWeight`: the weight the reps were done with. */
  weightKg?: number;
}

/** Epley estimate; only up to this many reps (the estimate gets unreliable above). */
const ONE_RM_MAX_REPS = 12;

export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** Epley estimate of a set, or undefined when it is not meaningful (no weight, > 12 reps). */
export function setOneRepMax(set: Pick<GymSet, 'weightKg' | 'reps'>): number | undefined {
  const w = set.weightKg ?? 0;
  const r = set.reps ?? 0;
  if (w <= 0 || r <= 0 || r > ONE_RM_MAX_REPS) return undefined;
  return estimateOneRepMax(w, r);
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
    const oneRm = setOneRepMax(set);
    if (oneRm !== undefined) out.oneRm = oneRm;
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
    for (const [kind, value] of Object.entries(setValues(set)) as [SetRecordKind, number][]) {
      if (value > (current[kind] ?? 0)) current[kind] = value;
    }
    bests.set(set.exerciseId, current);
  }
  return bests;
}

/** Weight key without float noise (0.01 kg). */
const weightKey = (kg: number) => Math.round(kg * 100);

/** Most reps ever done per weight (weighted working sets only), keyed by `weightKey`. */
function repsByWeight(sets: readonly GymSet[]): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  for (const set of sets) {
    if (!countsAsWork(set) || !set.weightKg || !set.reps) continue;
    const map = out.get(set.exerciseId) ?? new Map<number, number>();
    const key = weightKey(set.weightKg);
    map.set(key, Math.max(map.get(key) ?? 0, set.reps));
    out.set(set.exerciseId, map);
  }
  return out;
}

/** Σ weight × reps per exercise and session. */
function volumeBySession(sets: readonly GymSet[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const set of sets) {
    if (!countsAsWork(set)) continue;
    const v = (set.weightKg ?? 0) * (set.reps ?? 0);
    if (v <= 0) continue;
    const map = out.get(set.exerciseId) ?? new Map<string, number>();
    map.set(set.sessionId, (map.get(set.sessionId) ?? 0) + v);
    out.set(set.exerciseId, map);
  }
  return out;
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
  const offer = (
    r: PersonalRecord,
    better = (a: PersonalRecord, b: PersonalRecord) => a.value > b.value,
  ) => {
    const key = `${r.exerciseId}|${r.kind}`;
    const seen = best.get(key);
    if (!seen || better(r, seen)) best.set(key, r);
  };

  for (const set of sessionSets) {
    if (!countsAsWork(set)) continue;
    const previous = before.get(set.exerciseId);
    if (!previous) continue;
    for (const [kind, value] of Object.entries(setValues(set)) as [SetRecordKind, number][]) {
      const prev = previous[kind];
      if (prev === undefined || value <= prev) continue;
      offer({ exerciseId: set.exerciseId, kind, value, previous: prev, setId: set.id });
    }
  }

  // More reps than ever at a weight that was lifted before; the heaviest such weight is shown.
  const repsBefore = repsByWeight(history);
  for (const set of sessionSets) {
    if (!countsAsWork(set) || !set.weightKg || !set.reps) continue;
    const prev = repsBefore.get(set.exerciseId)?.get(weightKey(set.weightKg));
    if (prev === undefined || set.reps <= prev) continue;
    offer(
      {
        exerciseId: set.exerciseId,
        kind: 'repsAtWeight',
        value: set.reps,
        previous: prev,
        setId: set.id,
        weightKg: set.weightKg,
      },
      (a, b) => (a.weightKg as number) > (b.weightKg as number),
    );
  }

  // Session volume per exercise against the best earlier session.
  const volBefore = volumeBySession(history);
  for (const [exerciseId, bySession] of volumeBySession(sessionSets)) {
    const earlier = volBefore.get(exerciseId);
    if (!earlier) continue;
    const prev = Math.max(...earlier.values());
    for (const [sessionId, value] of bySession) {
      if (value <= prev) continue;
      const own = sessionSets.filter(
        (s) => s.sessionId === sessionId && s.exerciseId === exerciseId && countsAsWork(s),
      );
      offer({
        exerciseId,
        kind: 'sessionVolume',
        value: round1(value),
        previous: round1(prev),
        setId: (own[own.length - 1] as GymSet).id,
      });
    }
  }

  return [...best.values()].sort(
    (a, b) =>
      a.exerciseId.localeCompare(b.exerciseId) ||
      RECORD_KINDS.indexOf(a.kind) - RECORD_KINDS.indexOf(b.kind),
  );
}

/** All-time records of one exercise (exercise detail screen). */
export interface ExerciseRecords {
  heaviest?: { weightKg: number; reps?: number; sessionId: string };
  bestOneRm?: { value: number; weightKg: number; reps: number; sessionId: string };
  bestSessionVolume?: { value: number; sessionId: string };
  /** Most reps per weight, heaviest weight first. */
  repsAtWeight: { weightKg: number; reps: number }[];
  /** Bodyweight reps, time and distance bests. */
  reps?: number;
  durationSec?: number;
  distanceM?: number;
}

export function exerciseRecords(exerciseId: string, sets: readonly GymSet[]): ExerciseRecords {
  const own = sets.filter((s) => s.exerciseId === exerciseId && countsAsWork(s));
  const out: ExerciseRecords = { repsAtWeight: [] };
  for (const s of own) {
    const w = s.weightKg ?? 0;
    const r = s.reps ?? 0;
    if (
      w > 0 &&
      (w > (out.heaviest?.weightKg ?? 0) ||
        (w === out.heaviest?.weightKg && r > (out.heaviest.reps ?? 0)))
    ) {
      out.heaviest = { weightKg: w, ...(r > 0 ? { reps: r } : {}), sessionId: s.sessionId };
    }
    const one = setOneRepMax(s);
    if (one !== undefined && one > (out.bestOneRm?.value ?? 0)) {
      out.bestOneRm = { value: one, weightKg: w, reps: r, sessionId: s.sessionId };
    }
    if (w === 0 && r > (out.reps ?? 0)) out.reps = r;
    if ((s.durationSec ?? 0) > (out.durationSec ?? 0)) out.durationSec = s.durationSec;
    if ((s.distanceM ?? 0) > (out.distanceM ?? 0)) out.distanceM = s.distanceM;
  }
  for (const [sessionId, value] of volumeBySession(own).get(exerciseId) ?? []) {
    if (value > (out.bestSessionVolume?.value ?? 0)) {
      out.bestSessionVolume = { value: round1(value), sessionId };
    }
  }
  out.repsAtWeight = [...(repsByWeight(own).get(exerciseId) ?? [])]
    .map(([key, reps]) => ({ weightKg: key / 100, reps }))
    .sort((a, b) => b.weightKg - a.weightKg);
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
