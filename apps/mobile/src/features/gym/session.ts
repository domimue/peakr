import {
  adaptToEquipment,
  defaultRestSec,
  getTemplate,
  lastSetsOf,
  parseReps,
  prefillExercise,
  resolveExercise,
  routineMinutes,
  targetToText,
  type CustomExercise,
  type ExercisePrefill,
  type GymRoutine,
  type GymSession,
  type GymSet,
  type SetLog,
  type StrengthEquipment,
  type Workout,
} from '@peakr/engine';
import type { TFunction } from 'i18next';

import { daysBetween, newId } from '@/data/ids';
import type { GymHistory } from '@/data/repositories/gym-repository';

import { exerciseLabel, exerciseTexts } from './exercise-text';

/** What the workout screen shows, whatever it was started from. */
export interface SessionExercise {
  exerciseId: string;
  /** Free-text name (unknown exercise ids). */
  name?: string;
  sets: number;
  /** Prescription text (`"8–12"`, `"30 s"`). */
  reps: string;
  restSec: number;
  weightKg?: number;
  supersetGroup?: string;
  notes?: string;
}

export interface StrengthSession {
  /** Routine name, or empty for template / plan sessions (titled by type). */
  title: string;
  /** `routine:<id>` or a template id – remembered with the session. */
  sourceId: string;
  routineId?: string;
  /** The planned workout this session fulfils. */
  plannedWorkoutId?: string;
  durationMin: number;
  exercises: SessionExercise[];
}

export function routineSession(routine: GymRoutine): StrengthSession {
  return {
    title: routine.name,
    sourceId: `routine:${routine.id}`,
    routineId: routine.id,
    durationMin: routineMinutes(routine),
    exercises: routine.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.targetSets,
      reps: targetToText(e.target),
      restSec: e.restSec,
      ...(e.weightKg !== undefined ? { weightKg: e.weightKg } : {}),
      ...(e.supersetGroup ? { supersetGroup: e.supersetGroup } : {}),
      ...(e.notes ? { notes: e.notes } : {}),
    })),
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
    plannedWorkoutId: workout.id,
    ...(workout.templateId.startsWith('routine:')
      ? { routineId: workout.templateId.slice('routine:'.length) }
      : {}),
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

/** Working sets of the most recent session that has the exercise, and how long ago it was. */
export function lastSetsFor(
  history: GymHistory,
  exerciseId: string,
  today: string,
): { sets: SetLog[]; daysSince: number } | null {
  const last = lastSetsOf(exerciseId, history.sessions, history.sets);
  return last ? { sets: last.sets, daysSince: daysBetween(last.date, today) } : null;
}

/** Pre-filled sets for every exercise of a session (§8.5). */
export function prefillSession(
  session: StrengthSession,
  history: GymHistory,
  today: string,
  custom: readonly CustomExercise[],
): ExercisePrefill[] {
  return session.exercises.map((e) => {
    const last = lastSetsFor(history, e.exerciseId, today);
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
  return exerciseLabel(t, exerciseId, custom, fallback);
}

/** Instructions of a library or custom exercise, if any. */
export function exerciseHowTo(
  t: TFunction,
  exerciseId: string,
  custom: readonly CustomExercise[],
): string | undefined {
  const exercise = resolveExercise(exerciseId, custom);
  return exercise ? exerciseTexts(t, exercise).instructions : undefined;
}

/** One set as entered in the workout screen. */
export interface LoggedSet {
  exerciseId: string;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  rpe?: number;
}

/** A finished detailed session from the sets the user ticked off. */
export function buildDetailedSession(
  session: StrengthSession,
  sets: readonly LoggedSet[],
  options: { date: string; startedAt: number; durationMin: number; endedAt?: number },
): { session: GymSession; sets: GymSet[] } {
  const id = newId();
  const endedAt = options.endedAt ?? Date.now();
  return {
    session: {
      id,
      date: options.date,
      startedAt: options.startedAt,
      endedAt,
      durationMin: options.durationMin,
      title: session.title,
      kind: 'detailed',
      source: 'app',
      sourceId: session.sourceId,
      ...(session.routineId ? { routineId: session.routineId } : {}),
      ...(session.plannedWorkoutId ? { plannedWorkoutId: session.plannedWorkoutId } : {}),
    },
    sets: sets.map((s, setIndex) => ({
      id: newId(),
      sessionId: id,
      exerciseId: s.exerciseId,
      setIndex,
      setType: 'working',
      completed: true,
      loggedAt: endedAt,
      ...(s.weightKg !== undefined ? { weightKg: s.weightKg } : {}),
      ...(s.reps !== undefined ? { reps: s.reps } : {}),
      ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
      ...(s.rpe !== undefined ? { rpe: s.rpe } : {}),
    })),
  };
}

/** A quick log (§8.7) as a gym session without sets. */
export function buildQuickSession(fields: {
  date: string;
  now: number;
  durationMin: number;
  rpe: number;
  legs: boolean;
  sourceId?: string;
  plannedWorkoutId?: string;
}): GymSession {
  return {
    id: newId(),
    date: fields.date,
    startedAt: fields.now - fields.durationMin * 60000,
    endedAt: fields.now,
    durationMin: fields.durationMin,
    title: '',
    kind: 'quick',
    sessionRpe: fields.rpe,
    legs: fields.legs,
    source: 'app',
    ...(fields.sourceId ? { sourceId: fields.sourceId } : {}),
    ...(fields.plannedWorkoutId ? { plannedWorkoutId: fields.plannedWorkoutId } : {}),
  };
}

/** Whether a prescription is timed (`"30 s"`) rather than reps. */
export function isTimed(reps: string): boolean {
  return parseReps(reps)?.unit === 'sec';
}
