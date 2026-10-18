import {
  adaptToEquipment,
  defaultRestSec,
  getTemplate,
  prefillExercise,
  resolveExercise,
  type CustomExercise,
  type ExercisePrefill,
  type Routine,
  type SetLog,
  type StrengthEquipment,
  type Workout,
} from '@peakr/engine';
import type { TFunction } from 'i18next';

import { daysBetween, newId } from '@/data/ids';
import type { StrengthLogEntry } from '@/data/repositories/strength-repository';

/** What the strength workout screen shows, whatever it was started from. */
export interface SessionExercise {
  exerciseId: string;
  /** Free-text name (imports, routine entries without a library exercise). */
  name?: string;
  sets: number;
  reps: string;
  restSec: number;
  weightKg?: number;
}

export interface StrengthSession {
  /** Routine name, or empty for template / plan sessions (titled by type). */
  title: string;
  /** `routine:<id>` or a template id – remembered with the log. */
  sourceId: string;
  durationMin: number;
  exercises: SessionExercise[];
}

export function routineSession(routine: Routine): StrengthSession {
  return {
    title: routine.name,
    sourceId: `routine:${routine.id}`,
    durationMin: routine.durationMin,
    exercises: routine.exercises.map((e, i) => {
      const exerciseId = e.exerciseId ?? `custom:${routine.id}:${i}`;
      return {
        exerciseId,
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        restSec: e.restSec ?? defaultRestSec(exerciseId, e.reps),
        weightKg: e.weightKg,
      };
    }),
  };
}

/** A library session (e.g. `strength.push`), adapted to the user's equipment. */
export function templateSession(
  templateId: string,
  equipment?: StrengthEquipment,
): StrengthSession {
  const template = getTemplate(templateId);
  const def = template.strength;
  if (!def) throw new Error(`not a strength template: ${templateId}`);
  const adapted = equipment ? adaptToEquipment(def, template.legLoad, equipment).def : def;
  return {
    title: '',
    sourceId: template.id,
    durationMin: def.durationMin,
    exercises: adapted.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets,
      reps: e.reps,
      restSec: e.restSec ?? defaultRestSec(e.exerciseId, e.reps),
    })),
  };
}

/** A strength workout of the generated plan (already phase-scaled and adapted). */
export function planWorkoutSession(workout: Workout): StrengthSession {
  return {
    title: '',
    sourceId: workout.templateId,
    durationMin: workout.durationMin,
    exercises: (workout.exercises ?? []).map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets,
      reps: e.reps,
      restSec: e.restSec,
      weightKg: e.weightKg,
    })),
  };
}

/** Sets of the most recent detailed log that contains the exercise, and how long ago it was. */
export function lastSetsFor(
  logs: readonly StrengthLogEntry[],
  exerciseId: string,
  today: string,
): { sets: SetLog[]; daysSince: number } | null {
  const sorted = [...logs].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
  );
  for (const entry of sorted) {
    if (entry.log.kind !== 'detailed') continue;
    const sets = entry.log.sets.filter((s) => s.exerciseId === exerciseId);
    if (sets.length > 0) return { sets, daysSince: daysBetween(entry.date, today) };
  }
  return null;
}

/** Pre-filled sets for every exercise of a session (§8.5). */
export function prefillSession(
  session: StrengthSession,
  logs: readonly StrengthLogEntry[],
  today: string,
  custom: readonly CustomExercise[],
): ExercisePrefill[] {
  return session.exercises.map((e) => {
    const last = lastSetsFor(logs, e.exerciseId, today);
    return prefillExercise(e, last?.sets ?? [], { daysSinceLast: last?.daysSince, custom });
  });
}

/** Display name of a library, custom or free-text exercise. */
export function exerciseName(
  t: TFunction,
  exerciseId: string,
  custom: readonly CustomExercise[],
  fallback?: string,
): string {
  const ex = resolveExercise(exerciseId, custom);
  if (ex && 'name' in ex) return ex.name;
  if (ex) return t(`exercises.${exerciseId}.name` as never);
  return fallback ?? exerciseId;
}

/** How-to text of a library or custom exercise, if any. */
export function exerciseHowTo(
  t: TFunction,
  exerciseId: string,
  custom: readonly CustomExercise[],
): string | undefined {
  const ex = resolveExercise(exerciseId, custom);
  if (ex && 'name' in ex) return ex.howTo;
  return ex ? (t(`exercises.${exerciseId}.howTo` as never) as string) : undefined;
}

/** A new log row with id and creation time. */
export function newLogEntry(fields: Omit<StrengthLogEntry, 'id' | 'createdAt'>): StrengthLogEntry {
  return { ...fields, id: newId(), createdAt: Date.now() };
}
