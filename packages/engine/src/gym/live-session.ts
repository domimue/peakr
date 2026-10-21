import type { PlannedSet, SetLog } from '../plan/strength-log';
import { extendRest, REST_EXTEND_SEC, startRest, type RestTimer } from './rest-timer';
import type { GymSession, GymSet, SetType } from './types';

/**
 * A gym session while it is being trained (CLAUDE.md "Gym": live session). Pure state and a
 * reducer; the app keeps it in a store and writes every change to SQLite so it survives the app
 * being killed (`restore.ts`). Weights in kg, times in epoch ms.
 */

export interface LiveSet {
  id: string;
  setType: SetType;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  rpe?: number;
  completed: boolean;
  completedAt?: number;
  /** What the plan / progression asks for (pre-fill, §8.5). Empty inputs take these values. */
  target?: PlannedSet;
  /** The same set of the previous session – shown greyed as the value to beat. */
  previous?: SetLog;
}

export interface LiveExercise {
  /** Stable id of this entry in the session (an exercise may appear twice). */
  entryId: string;
  exerciseId: string;
  /** Free-text name for unknown exercise ids. */
  name?: string;
  /** Prescription text (`"8–12"`, `"30 s"`), empty for free sessions. */
  prescription: string;
  /** Timed exercise: sets log seconds instead of reps. */
  timed: boolean;
  restSec: number;
  /** Entries sharing a group are a superset: done in turns, rest after the last one. */
  supersetGroup?: string;
  notes?: string;
  sets: LiveSet[];
}

export interface LiveFocus {
  entryId: string;
  setId: string;
}

export interface LiveSession {
  id: string;
  title: string;
  /** Local calendar day the session was started (YYYY-MM-DD). */
  date: string;
  startedAt: number;
  sourceId?: string;
  routineId?: string;
  plannedWorkoutId?: string;
  exercises: LiveExercise[];
  rest: RestTimer | null;
  /** The set to do next (where the keypad goes after a completed set). */
  focus: LiveFocus | null;
  notes?: string;
}

export interface LiveExerciseInput {
  entryId: string;
  exerciseId: string;
  name?: string;
  prescription: string;
  timed: boolean;
  restSec: number;
  supersetGroup?: string;
  notes?: string;
  /** Pre-filled sets (one per planned set). */
  sets: readonly PlannedSet[];
  /** Working sets of the previous session, in order. */
  previous: readonly SetLog[];
}

export function createLiveSession(
  fields: Omit<LiveSession, 'exercises' | 'rest' | 'focus'>,
  exercises: readonly LiveExerciseInput[],
  newId: () => string,
): LiveSession {
  const list = exercises.map((e) => liveExercise(e, newId));
  return { ...fields, exercises: list, rest: null, focus: firstOpen(list) };
}

export function liveExercise(e: LiveExerciseInput, newId: () => string): LiveExercise {
  const { sets, previous, ...rest } = e;
  return {
    ...rest,
    sets: sets.map((target, i) => ({
      id: newId(),
      setType: 'working',
      completed: false,
      target: { ...target },
      ...(previous[i] ? { previous: { ...previous[i] } } : {}),
    })),
  };
}

export type SetPatch = Partial<Pick<LiveSet, 'weightKg' | 'reps' | 'durationSec' | 'rpe'>>;

export type LiveAction =
  | { type: 'completeSet'; entryId: string; setId: string }
  | { type: 'uncompleteSet'; entryId: string; setId: string }
  | { type: 'updateSet'; entryId: string; setId: string; patch: SetPatch }
  | { type: 'setSetType'; entryId: string; setId: string; setType: SetType }
  | { type: 'addSet'; entryId: string; setId: string }
  | { type: 'removeSet'; entryId: string; setId: string }
  | { type: 'addExercise'; exercise: LiveExercise }
  | { type: 'removeExercise'; entryId: string }
  | { type: 'setRestSec'; entryId: string; restSec: number }
  | { type: 'skipRest' }
  | { type: 'extendRest'; sec?: number }
  | { type: 'focus'; focus: LiveFocus | null }
  | { type: 'setNotes'; notes: string };

/** Applies one action. Unknown entries or sets leave the session unchanged. */
export function liveReducer(state: LiveSession, action: LiveAction, now: number): LiveSession {
  switch (action.type) {
    case 'completeSet':
      return completeSet(state, action.entryId, action.setId, now);
    case 'uncompleteSet':
      return mapSet(state, action.entryId, action.setId, (s) =>
        withoutKeys({ ...s, completed: false }, ['completedAt']),
      );
    case 'updateSet':
      return mapSet(state, action.entryId, action.setId, (s) => applyPatch(s, action.patch));
    case 'setSetType':
      return mapSet(state, action.entryId, action.setId, (s) => ({
        ...s,
        setType: action.setType,
      }));
    case 'addSet':
      return mapExercise(state, action.entryId, (e) => ({
        ...e,
        sets: [...e.sets, nextSet(e, action.setId)],
      }));
    case 'removeSet': {
      const next = mapExercise(state, action.entryId, (e) => ({
        ...e,
        sets: e.sets.filter((s) => s.id !== action.setId),
      }));
      return refocus(next, state.focus?.setId === action.setId);
    }
    case 'addExercise': {
      const exercises = [...state.exercises, action.exercise];
      return { ...state, exercises, focus: state.focus ?? firstOpen(exercises) };
    }
    case 'removeExercise': {
      const exercises = state.exercises.filter((e) => e.entryId !== action.entryId);
      const rest = state.rest?.entryId === action.entryId ? null : state.rest;
      return refocus({ ...state, exercises, rest }, state.focus?.entryId === action.entryId);
    }
    case 'setRestSec':
      return mapExercise(state, action.entryId, (e) => ({
        ...e,
        restSec: Math.max(0, Math.round(action.restSec)),
      }));
    case 'skipRest':
      return state.rest ? { ...state, rest: null } : state;
    case 'extendRest':
      return state.rest
        ? { ...state, rest: extendRest(state.rest, action.sec ?? REST_EXTEND_SEC, now) }
        : state;
    case 'focus':
      return { ...state, focus: action.focus };
    case 'setNotes':
      return { ...state, notes: action.notes };
  }
}

function mapExercise(
  state: LiveSession,
  entryId: string,
  fn: (e: LiveExercise) => LiveExercise,
): LiveSession {
  if (!state.exercises.some((e) => e.entryId === entryId)) return state;
  return {
    ...state,
    exercises: state.exercises.map((e) => (e.entryId === entryId ? fn(e) : e)),
  };
}

function mapSet(
  state: LiveSession,
  entryId: string,
  setId: string,
  fn: (s: LiveSet) => LiveSet,
): LiveSession {
  const exercise = state.exercises.find((e) => e.entryId === entryId);
  if (!exercise?.sets.some((s) => s.id === setId)) return state;
  return mapExercise(state, entryId, (e) => ({
    ...e,
    sets: e.sets.map((s) => (s.id === setId ? fn(s) : s)),
  }));
}

function withoutKeys<T extends object>(obj: T, keys: readonly (keyof T)[]): T {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k as keyof T))) as T;
}

/** Sets the patched values; an empty, negative or non-finite value clears the field. */
function applyPatch(set: LiveSet, patch: SetPatch): LiveSet {
  const cleared: (keyof LiveSet)[] = [];
  const next: LiveSet = { ...set };
  for (const key of ['weightKg', 'reps', 'durationSec', 'rpe'] as const) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined || !Number.isFinite(value) || value < 0) cleared.push(key);
    else next[key] = value;
  }
  return withoutKeys(next, cleared);
}

const VALUE_KEYS = ['weightKg', 'reps', 'durationSec'] as const;

/** The defined weight, reps and duration of a set, target or log; 0 kg means bodyweight. */
function valuesOf(from: PlannedSet | undefined): PlannedSet {
  const out: PlannedSet = {};
  for (const key of VALUE_KEYS) {
    const v = from?.[key];
    if (v !== undefined && !(key === 'weightKg' && v === 0)) out[key] = v;
  }
  return out;
}

/** A new set copies the last set's values and target (the usual "one more set"). */
function nextSet(e: LiveExercise, id: string): LiveSet {
  const last = e.sets[e.sets.length - 1];
  const target = last?.target ?? last?.previous;
  return {
    id,
    // After warm-ups comes work; drop and failure sets usually come in a row.
    setType: last?.setType === 'drop' || last?.setType === 'failure' ? last.setType : 'working',
    completed: false,
    ...valuesOf(last),
    ...(target ? { target: valuesOf(target) } : {}),
  };
}

/**
 * Values a set is logged with: what the user typed, else the target, else last time's value –
 * so a set done exactly as suggested needs only the check.
 */
export function effectiveValues(set: LiveSet): SetPatch {
  const out: SetPatch = {};
  for (const key of VALUE_KEYS) {
    const v = set[key] ?? set.target?.[key] ?? set.previous?.[key];
    if (v !== undefined) out[key] = v;
  }
  if (set.rpe !== undefined) out.rpe = set.rpe;
  return out;
}

function completeSet(state: LiveSession, entryId: string, setId: string, now: number): LiveSession {
  const done = mapSet(state, entryId, setId, (s) => ({
    ...s,
    ...effectiveValues(s),
    completed: true,
    completedAt: now,
  }));
  if (done === state) return state;
  const exercise = done.exercises.find((e) => e.entryId === entryId) as LiveExercise;
  const step = afterSet(done.exercises, exercise);
  return {
    ...done,
    focus: step.focus,
    rest: step.rest ? startRest(entryId, exercise.restSec, now) : done.rest,
  };
}

const firstOpenSet = (e: LiveExercise) => e.sets.find((s) => !s.completed);

/**
 * Where to go after a set of `exercise`, and whether to rest. Supersets cycle: the next exercise of
 * the group with an open set comes right away; the rest starts after the last exercise of a round.
 * Otherwise the next open set of the same exercise (after a rest), then the next exercise.
 */
export function afterSet(
  exercises: readonly LiveExercise[],
  exercise: LiveExercise,
): { focus: LiveFocus | null; rest: boolean } {
  const group = exercise.supersetGroup
    ? exercises.filter((e) => e.supersetGroup === exercise.supersetGroup)
    : [];
  if (group.length > 1) {
    const at = group.indexOf(exercise);
    const later = group.slice(at + 1).find(firstOpenSet);
    if (later) return { focus: focusOf(later), rest: false };
    const again = group.find(firstOpenSet);
    if (again) return { focus: focusOf(again), rest: true };
  } else {
    const open = firstOpenSet(exercise);
    if (open) return { focus: { entryId: exercise.entryId, setId: open.id }, rest: true };
  }
  return { focus: firstOpen(exercises), rest: true };
}

function focusOf(e: LiveExercise): LiveFocus | null {
  const open = firstOpenSet(e);
  return open ? { entryId: e.entryId, setId: open.id } : null;
}

function firstOpen(exercises: readonly LiveExercise[]): LiveFocus | null {
  for (const e of exercises) {
    const f = focusOf(e);
    if (f) return f;
  }
  return null;
}

function refocus(state: LiveSession, lost: boolean): LiveSession {
  return lost ? { ...state, focus: firstOpen(state.exercises) } : state;
}

/** Completed sets and how many are open – for the header and the "finish" check. */
export function liveProgress(state: LiveSession): { done: number; total: number } {
  const all = state.exercises.flatMap((e) => e.sets);
  return { done: all.filter((s) => s.completed).length, total: all.length };
}

/**
 * The finished session as it is stored: completed sets only, numbered in session order.
 * `durationMin` is the time from start to finish.
 */
export function toGymSession(
  live: LiveSession,
  endedAt: number,
  newId: () => string,
  notes?: string,
): { session: GymSession; sets: GymSet[] } {
  const note = (notes ?? live.notes ?? '').trim();
  const session: GymSession = {
    id: live.id,
    date: live.date,
    startedAt: live.startedAt,
    endedAt,
    durationMin: Math.max(1, Math.round((endedAt - live.startedAt) / 60000)),
    title: live.title,
    kind: 'detailed',
    source: 'app',
    ...(live.sourceId ? { sourceId: live.sourceId } : {}),
    ...(live.routineId ? { routineId: live.routineId } : {}),
    ...(live.plannedWorkoutId ? { plannedWorkoutId: live.plannedWorkoutId } : {}),
    ...(note ? { notes: note } : {}),
  };
  const sets: GymSet[] = [];
  for (const e of live.exercises) {
    for (const s of e.sets) {
      if (!s.completed) continue;
      sets.push({
        id: newId(),
        sessionId: live.id,
        exerciseId: e.exerciseId,
        setIndex: sets.length,
        setType: s.setType,
        completed: true,
        loggedAt: s.completedAt ?? endedAt,
        ...valuesOf(s),
        ...(s.rpe !== undefined ? { rpe: s.rpe } : {}),
      });
    }
  }
  return { session, sets };
}
