import type { CustomExercise, Exercise, MuscleGroup } from '../plan/library';
import { resolveExercise } from '../plan/library';
import { countsAsWork, findNewRecords, type PersonalRecord } from './records';
import type { GymSession, GymSet } from './types';

/** Derived figures of one gym session (CLAUDE.md "Gym": volume, sets, reps, muscles, records). */
export interface SessionSummary {
  /** Σ weight × reps of completed working sets, in kg. Bodyweight sets add nothing. */
  volumeKg: number;
  /** Completed sets that are not warm-ups. */
  sets: number;
  warmupSets: number;
  reps: number;
  durationMin: number;
  /** Working sets per muscle group: primary muscles count 1, secondary 0.5. Most-trained first. */
  muscles: { muscle: MuscleGroup; sets: number }[];
  records: PersonalRecord[];
}

const SECONDARY_SHARE = 0.5;

/** Minutes from start to end; without an end time, to the last logged set. Quick logs keep theirs. */
export function sessionDurationMin(session: GymSession, sets: readonly GymSet[]): number {
  if (
    session.kind === 'quick' ||
    (session.endedAt === undefined && session.durationMin !== undefined)
  ) {
    return session.durationMin ?? 0;
  }
  const end = session.endedAt ?? Math.max(session.startedAt, ...sets.map((s) => s.loggedAt));
  return Math.max(0, Math.round((end - session.startedAt) / 60000));
}

export function summarizeSession(
  session: GymSession,
  sets: readonly GymSet[],
  history: readonly GymSet[] = [],
  custom: readonly CustomExercise[] = [],
): SessionSummary {
  const own = sets.filter((s) => s.sessionId === session.id);
  const work = own.filter(countsAsWork);
  const muscleSets = new Map<MuscleGroup, number>();
  const add = (m: MuscleGroup, n: number) => muscleSets.set(m, (muscleSets.get(m) ?? 0) + n);
  for (const set of work) {
    const exercise: Exercise | CustomExercise | undefined = resolveExercise(set.exerciseId, custom);
    if (!exercise) continue;
    for (const m of exercise.primaryMuscles) add(m, 1);
    for (const m of exercise.secondaryMuscles) add(m, SECONDARY_SHARE);
  }
  return {
    volumeKg: round1(work.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0)),
    sets: work.length,
    warmupSets: own.filter((s) => s.completed && s.setType === 'warmup').length,
    reps: work.reduce((sum, s) => sum + (s.reps ?? 0), 0),
    durationMin: sessionDurationMin(session, own),
    muscles: [...muscleSets.entries()]
      .map(([muscle, n]) => ({ muscle, sets: n }))
      .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle)),
    records: findNewRecords(
      own,
      history.filter((s) => s.sessionId !== session.id),
    ),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
