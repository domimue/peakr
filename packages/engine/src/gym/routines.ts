import { getTemplate, resolveExercise, splits, type CustomExercise } from '../plan/library';
import { assertDefined } from '../result';
import { defaultRestSec, parseReps } from '../plan/strength-reps';
import type { Routine, SplitId } from '../plan/types';
import type { GymRoutine, GymRoutineExercise, RoutineFolder, SetTarget } from './types';

/** Routine helpers: targets, duration estimate, plan adapter and starter routines (WORKOUTS.md §8.2). */

/** Parses a prescription text (`"8–12"`, `"10"`, `"30–45 s"`, `"20 m"`) into a set target. */
export function targetFromText(text: string): SetTarget | null {
  const range = parseReps(text);
  if (range) {
    return range.unit === 'sec'
      ? { kind: 'time', minSec: range.min, maxSec: range.max }
      : { kind: 'reps', min: range.min, max: range.max };
  }
  const m = /^\s*(\d+(?:\.\d+)?)\s*m\s*$/i.exec(text);
  return m ? { kind: 'distance', m: Number(m[1]) } : null;
}

/** The prescription text the plan engine reads (`parseReps`), e.g. `"8–12"` or `"30–45 s"`. */
export function targetToText(target: SetTarget): string {
  switch (target.kind) {
    case 'reps':
      return target.min === target.max ? `${target.min}` : `${target.min}–${target.max}`;
    case 'time':
      return target.minSec === target.maxSec
        ? `${target.minSec} s`
        : `${target.minSec}–${target.maxSec} s`;
    case 'distance':
      return `${target.m} m`;
  }
}

/** Seconds of work per set: ~3 s per rep, the top of a time target, ~1 s per 3 m. */
function workSec(target: SetTarget): number {
  switch (target.kind) {
    case 'reps':
      return target.max * 3;
    case 'time':
      return target.maxSec;
    case 'distance':
      return target.m / 3;
  }
}

/** Set-up and changeover per exercise (walking to the machine, adjusting the seat, loading plates). */
const CHANGEOVER_SEC = 60;

/**
 * Planned minutes of a routine: work and rest of every set plus changeovers. Exercises in a
 * superset share their rest – only the last one of the group rests.
 */
export function estimateRoutineMinutes(exercises: readonly GymRoutineExercise[]): number {
  let sec = 0;
  exercises.forEach((e, i) => {
    const next = exercises[i + 1];
    const restsAfter = !e.supersetGroup || next?.supersetGroup !== e.supersetGroup;
    sec += e.targetSets * (workSec(e.target) + (restsAfter ? e.restSec : 0)) + CHANGEOVER_SEC;
  });
  return Math.max(5, Math.round(sec / 300) * 5);
}

export function routineMinutes(routine: GymRoutine): number {
  return routine.durationMin ?? estimateRoutineMinutes(routine.exercises);
}

/** The plan engine's view of a routine ("My own routines", §8.1), so scheduling stays unchanged. */
export function toPlanRoutine(
  routine: GymRoutine,
  custom: readonly CustomExercise[] = [],
): Routine {
  return {
    id: routine.id,
    name: routine.name,
    durationMin: routineMinutes(routine),
    exercises: routine.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.targetSets,
      reps: targetToText(e.target),
      restSec: e.restSec,
      ...(e.weightKg !== undefined ? { weightKg: e.weightKg } : {}),
      ...(e.legLoad
        ? { legLoad: e.legLoad }
        : resolveExercise(e.exerciseId, custom)
          ? {}
          : { legLoad: 'light' as const }),
    })),
  };
}

/** Routines the planner may schedule: not archived. */
export function activeRoutines(routines: readonly GymRoutine[]): GymRoutine[] {
  return routines.filter((r) => r.archivedAt === undefined);
}

/** A copy with new ids (the routine and every entry); superset groups are kept together. */
export function duplicateRoutine(
  routine: GymRoutine,
  newId: () => string,
  name: string,
): GymRoutine {
  const groups = new Map<string, string>();
  const rest: GymRoutine = { ...routine };
  delete rest.archivedAt;
  return {
    ...rest,
    id: newId(),
    name,
    position: routine.position + 1,
    exercises: routine.exercises.map((e) => {
      const group = e.supersetGroup;
      if (group && !groups.has(group)) groups.set(group, newId());
      return { ...e, id: newId(), ...(group ? { supersetGroup: groups.get(group) } : {}) };
    }),
  };
}

/**
 * Groups entries `ids` into one superset. They are moved next to the first of them so a superset is
 * always a contiguous block; entries already in other groups leave those groups.
 */
export function groupSuperset<T extends SupersetEntry>(
  exercises: readonly T[],
  ids: readonly string[],
  groupId: string,
): T[] {
  const picked = exercises.filter((e) => ids.includes(e.id));
  if (picked.length < 2) return [...exercises];
  const first = exercises.findIndex((e) => ids.includes(e.id));
  const rest = exercises.filter((e) => !ids.includes(e.id));
  const insertAt = exercises.slice(0, first).filter((e) => !ids.includes(e.id)).length;
  const grouped = picked.map((e) => ({ ...e, supersetGroup: groupId }));
  return cleanSupersets([...rest.slice(0, insertAt), ...grouped, ...rest.slice(insertAt)]);
}

export function ungroupSuperset<T extends SupersetEntry>(
  exercises: readonly T[],
  groupId: string,
): T[] {
  return exercises.map((e) => {
    if (e.supersetGroup !== groupId) return e;
    const rest = { ...e };
    delete rest.supersetGroup;
    return rest;
  });
}

/** What superset and reorder helpers need of a routine entry (also the builder's drafts). */
export interface SupersetEntry {
  id: string;
  supersetGroup?: string;
}

/** Moves one entry to a new index; superset groups that stop being one block are dissolved. */
export function moveRoutineExercise<T extends SupersetEntry>(
  exercises: readonly T[],
  from: number,
  to: number,
): T[] {
  const list = [...exercises];
  const [item] = list.splice(from, 1);
  if (!item) return list;
  list.splice(Math.max(0, Math.min(to, list.length)), 0, item);
  return cleanSupersets(list);
}

/** Drops superset groups that are no longer contiguous blocks of at least two entries. */
export function cleanSupersets<T extends SupersetEntry>(exercises: readonly T[]): T[] {
  const total = new Map<string, number>();
  for (const e of exercises) {
    if (e.supersetGroup) total.set(e.supersetGroup, (total.get(e.supersetGroup) ?? 0) + 1);
  }
  const valid = new Set<string>();
  let i = 0;
  while (i < exercises.length) {
    const group = exercises[i]?.supersetGroup;
    let j = i + 1;
    while (group && j < exercises.length && exercises[j]?.supersetGroup === group) j++;
    // Valid only when this block holds every entry of the group.
    if (group && j - i >= 2 && total.get(group) === j - i) valid.add(group);
    i = j;
  }
  return exercises.map((e) => {
    if (!e.supersetGroup || valid.has(e.supersetGroup)) return e;
    const rest = { ...e };
    delete rest.supersetGroup;
    return rest;
  });
}

/** Splits offered as starter routines for a new user (WORKOUTS.md §8.2). */
export const STARTER_SPLITS = [
  'fullBody',
  'upperLower',
  'pushPullLegs',
  'bodyPart',
] as const satisfies readonly SplitId[];
export type StarterSplit = (typeof STARTER_SPLITS)[number];

export interface StarterRoutines {
  folder: RoutineFolder;
  routines: GymRoutine[];
}

/**
 * One folder with a routine per session of the split, built from the split's templates (base phase
 * prescriptions, §8.4). Names come from the caller, which translates the session types.
 */
export function starterRoutines(
  split: SplitId,
  options: {
    newId: () => string;
    folderName: string;
    routineName: (sessionType: string) => string;
    folderPosition?: number;
  },
): StarterRoutines {
  const folder: RoutineFolder = {
    id: options.newId(),
    name: options.folderName,
    position: options.folderPosition ?? 0,
  };
  const routines = splits[split].rotation.map((type, position): GymRoutine => {
    const def = assertDefined(getTemplate(`strength.${type}`).strength, 'strength');
    return {
      id: options.newId(),
      name: options.routineName(type),
      folderId: folder.id,
      position,
      durationMin: def.durationMin,
      exercises: def.exercises.map((e): GymRoutineExercise => ({
        id: options.newId(),
        exerciseId: e.exerciseId,
        targetSets: e.sets,
        // Library prescriptions are always valid targets (tested).
        target: assertDefined(targetFromText(e.reps), 'target'),
        restSec: e.restSec ?? defaultRestSec(e.exerciseId, e.reps),
        targetRpe: def.rpe,
      })),
    };
  });
  return { folder, routines };
}
