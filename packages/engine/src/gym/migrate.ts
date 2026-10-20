import {
  CUSTOM_PREFIX,
  EQUIPMENT,
  EXERCISE_PATTERNS,
  type CustomExercise,
  type Equipment,
  type ExercisePattern,
  type MuscleGroup,
  MUSCLE_GROUPS,
} from '../plan/library';
import type { StrengthLog } from '../plan/strength-log';
import { defaultRestSec } from '../plan/strength-reps';
import type { LegLoad, Routine } from '../plan/types';
import { targetFromText } from './routines';
import type { GymRoutine, GymRoutineExercise, GymSession, GymSet } from './types';

/**
 * Moves Phase 3 strength data (routines, custom exercises and logs stored as JSON) into the gym
 * model. Nothing is dropped: every routine entry, custom exercise, log and set comes across; text
 * that has no structured place any more (an unparseable rep target) is kept in the entry's notes.
 */

/** A custom exercise as Phase 3 stored it. */
export interface LegacyCustomExercise {
  id: string;
  name: string;
  pattern: string;
  muscles?: string[];
  equipment: string[];
  legLoad: LegLoad;
  unilateral?: boolean;
  howTo?: string;
}

/** A row of the Phase 3 `strength_logs` table. */
export interface LegacyStrengthLog {
  id: string;
  date: string;
  title: string;
  sourceId: string | null;
  log: StrengthLog;
  createdAt: number;
}

export interface LegacyStrengthData {
  routines: readonly Routine[];
  customExercises: readonly LegacyCustomExercise[];
  logs: readonly LegacyStrengthLog[];
}

export interface MigratedGymData {
  exercises: CustomExercise[];
  routines: GymRoutine[];
  sessions: GymSession[];
  sets: GymSet[];
}

/** Phase 3 muscle words that are not muscle groups of the new library. */
const LEGACY_MUSCLES: Record<string, MuscleGroup[]> = {
  shoulders: ['front_delts', 'side_delts'],
  back: ['upper_back', 'lats'],
  core: ['abs'],
  hips: ['glutes'],
  ankles: ['calves'],
};

export function migrateMuscles(muscles: readonly string[] = []): MuscleGroup[] {
  const out = muscles.flatMap((m) =>
    (MUSCLE_GROUPS as readonly string[]).includes(m)
      ? [m as MuscleGroup]
      : (LEGACY_MUSCLES[m] ?? []),
  );
  return [...new Set(out)];
}

const DEFAULT_TARGET = { kind: 'reps', min: 8, max: 12 } as const;

/** A migrated custom exercise; built directly so no Phase 3 row can fail validation and get lost. */
function customExercise(fields: {
  id: string;
  name: string;
  pattern: ExercisePattern;
  equipment: Equipment[];
  legLoad: LegLoad;
  unilateral?: boolean;
  primaryMuscles?: MuscleGroup[];
  instructions?: string;
}): CustomExercise {
  const primaryMuscles = fields.primaryMuscles ?? [];
  return {
    id: fields.id,
    name: fields.name.trim().slice(0, 60) || fields.id,
    pattern: fields.pattern,
    primaryMuscles,
    secondaryMuscles: [],
    muscles: primaryMuscles,
    equipment: fields.equipment.length > 0 ? [...new Set(fields.equipment)] : ['bodyweight'],
    legLoad: fields.legLoad,
    unilateral: fields.unilateral ?? false,
    trackingMode: fields.pattern === 'mobility' ? 'time' : 'weightReps',
    ...(fields.instructions?.trim() ? { instructions: fields.instructions.trim() } : {}),
  };
}

/** Keeps the id exactly as it was: routines and logs refer to it. */
export function migrateCustomExercise(legacy: LegacyCustomExercise): CustomExercise {
  return customExercise({
    id: legacy.id,
    name: legacy.name,
    pattern: (EXERCISE_PATTERNS as readonly string[]).includes(legacy.pattern)
      ? (legacy.pattern as ExercisePattern)
      : 'other',
    equipment: legacy.equipment.filter((e): e is Equipment =>
      (EQUIPMENT as readonly string[]).includes(e),
    ),
    legLoad: legacy.legLoad,
    unilateral: legacy.unilateral,
    primaryMuscles: migrateMuscles(legacy.muscles),
    instructions: legacy.howTo,
  });
}

/**
 * Converts one routine. Free-text entries (imported, without a library exercise) become custom
 * exercises with the id Phase 3 logs already used for them (`custom:<routineId>:<index>`).
 */
export function migrateRoutine(
  routine: Routine,
  position: number,
  newId: () => string,
): { routine: GymRoutine; exercises: CustomExercise[] } {
  const created: CustomExercise[] = [];
  const entries = routine.exercises.map((e, i): GymRoutineExercise => {
    let exerciseId = e.exerciseId;
    if (!exerciseId) {
      exerciseId = `${CUSTOM_PREFIX}${routine.id}:${i}`;
      created.push(
        customExercise({
          id: exerciseId,
          name: e.name?.trim() || `${routine.name} ${i + 1}`,
          pattern: 'other',
          equipment: ['bodyweight'],
          legLoad: e.legLoad ?? 'light',
        }),
      );
    }
    const target = targetFromText(e.reps);
    return {
      id: newId(),
      exerciseId,
      targetSets: e.sets,
      target: target ?? DEFAULT_TARGET,
      restSec: e.restSec ?? defaultRestSec(exerciseId, e.reps),
      ...(target ? {} : { notes: e.reps }),
      ...(e.weightKg !== undefined ? { weightKg: e.weightKg } : {}),
      ...(e.legLoad !== undefined ? { legLoad: e.legLoad } : {}),
    };
  });
  return {
    routine: {
      id: routine.id,
      name: routine.name,
      position,
      durationMin: routine.durationMin,
      exercises: entries,
    },
    exercises: created,
  };
}

/**
 * Converts one log. Phase 3 kept only the day and the save time, so the session ends at the save
 * time and starts `durationMin` earlier; every set keeps its order.
 */
export function migrateStrengthLog(
  entry: LegacyStrengthLog,
  newId: () => string,
): { session: GymSession; sets: GymSet[] } {
  const { log } = entry;
  const routineId = entry.sourceId?.startsWith('routine:')
    ? entry.sourceId.slice('routine:'.length)
    : undefined;
  const base = {
    id: entry.id,
    date: entry.date,
    startedAt: entry.createdAt - log.durationMin * 60000,
    title: entry.title,
    durationMin: log.durationMin,
    source: 'migrated' as const,
    ...(entry.sourceId ? { sourceId: entry.sourceId } : {}),
    ...(routineId ? { routineId } : {}),
  };
  if (log.kind === 'quick') {
    return {
      session: { ...base, kind: 'quick', sessionRpe: log.rpe, legs: log.legs },
      sets: [],
    };
  }
  return {
    session: {
      ...base,
      kind: 'detailed',
      endedAt: entry.createdAt,
      ...(log.sessionRpe !== undefined ? { sessionRpe: log.sessionRpe } : {}),
    },
    sets: log.sets.map((s, setIndex) => ({
      id: newId(),
      sessionId: entry.id,
      exerciseId: s.exerciseId,
      setIndex,
      setType: 'working',
      completed: true,
      loggedAt: entry.createdAt,
      ...(s.weightKg !== undefined ? { weightKg: s.weightKg } : {}),
      ...(s.reps !== undefined ? { reps: s.reps } : {}),
      ...(s.rpe !== undefined ? { rpe: s.rpe } : {}),
      ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
    })),
  };
}

export function migrateStrengthData(
  data: LegacyStrengthData,
  newId: () => string,
): MigratedGymData {
  const exercises = data.customExercises.map(migrateCustomExercise);
  const routines: GymRoutine[] = [];
  data.routines.forEach((r, i) => {
    const migrated = migrateRoutine(r, i, newId);
    routines.push(migrated.routine);
    exercises.push(...migrated.exercises.filter((e) => !exercises.some((x) => x.id === e.id)));
  });
  const sessions: GymSession[] = [];
  const sets: GymSet[] = [];
  for (const log of data.logs) {
    const migrated = migrateStrengthLog(log, newId);
    sessions.push(migrated.session);
    sets.push(...migrated.sets);
  }
  return { exercises, routines, sessions, sets };
}
