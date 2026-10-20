import type { SetLog, StrengthLog } from '../plan/strength-log';
import { countsAsWork } from './records';
import { sessionDurationMin } from './summary';
import type { GymSession, GymSet } from './types';

/**
 * Gym sessions seen by the training plan: logged strength still counts towards load and spacing
 * (WORKOUTS.md §8.1) and pre-fills the next session (§8.5) through the existing strength code.
 */

const DEFAULT_QUICK_RPE = 7;

/** The plan's strength log of a session (detailed: working sets only). */
export function toStrengthLog(session: GymSession, sets: readonly GymSet[]): StrengthLog {
  const own = sets
    .filter((s) => s.sessionId === session.id)
    .sort((a, b) => a.setIndex - b.setIndex);
  if (session.kind === 'quick') {
    return {
      kind: 'quick',
      durationMin: session.durationMin ?? 0,
      rpe: session.sessionRpe ?? DEFAULT_QUICK_RPE,
      legs: session.legs ?? false,
    };
  }
  return {
    kind: 'detailed',
    durationMin: sessionDurationMin(session, own),
    ...(session.sessionRpe !== undefined ? { sessionRpe: session.sessionRpe } : {}),
    sets: own.filter(countsAsWork).map(toSetLog),
  };
}

export function toSetLog(set: GymSet): SetLog {
  return {
    exerciseId: set.exerciseId,
    ...(set.weightKg !== undefined ? { weightKg: set.weightKg } : {}),
    ...(set.reps !== undefined ? { reps: set.reps } : {}),
    ...(set.durationSec !== undefined ? { durationSec: set.durationSec } : {}),
    ...(set.rpe !== undefined ? { rpe: set.rpe } : {}),
  };
}

/**
 * Working sets of an exercise from the most recent session that has it, plus that session's date
 * – the input of `prefillExercise`.
 */
export function lastSetsOf(
  exerciseId: string,
  sessions: readonly GymSession[],
  sets: readonly GymSet[],
): { sets: SetLog[]; date: string } | null {
  const recentFirst = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  for (const session of recentFirst) {
    const found = sets
      .filter((s) => s.sessionId === session.id && s.exerciseId === exerciseId && countsAsWork(s))
      .sort((a, b) => a.setIndex - b.setIndex);
    if (found.length > 0) return { sets: found.map(toSetLog), date: session.date };
  }
  return null;
}
