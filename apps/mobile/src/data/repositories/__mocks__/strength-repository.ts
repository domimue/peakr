import type { CustomExercise, Routine } from '@peakr/engine';

import type { StoredStrengthSetup, StrengthLogEntry } from '../strength-repository';

/** In-memory strength repository for Jest (`jest.mock('@/data/repositories/strength-repository')`). */

export type { StoredStrengthSetup, StrengthLogEntry } from '../strength-repository';

export const store = {
  setup: null as StoredStrengthSetup | null,
  routines: [] as Routine[],
  customExercises: [] as CustomExercise[],
  logs: [] as StrengthLogEntry[],
};

export function resetStore(): void {
  store.setup = null;
  store.routines = [];
  store.customExercises = [];
  store.logs = [];
}

export const getStrengthSetup = jest.fn(async () => store.setup);
export const saveStrengthSetup = jest.fn(async (setup: StoredStrengthSetup) => {
  store.setup = setup;
});
export const listRoutines = jest.fn(async () => [...store.routines]);
export const saveRoutine = jest.fn(async (routine: Routine) => {
  store.routines = [routine, ...store.routines.filter((r) => r.id !== routine.id)];
});
export const deleteRoutine = jest.fn(async (id: string) => {
  store.routines = store.routines.filter((r) => r.id !== id);
});
export const listCustomExercises = jest.fn(async () => [...store.customExercises]);
export const saveCustomExercise = jest.fn(async (exercise: CustomExercise) => {
  store.customExercises = [...store.customExercises.filter((e) => e.id !== exercise.id), exercise];
});
export const listStrengthLogs = jest.fn(async () =>
  [...store.logs].sort((a, b) => b.createdAt - a.createdAt),
);
export const saveStrengthLog = jest.fn(async (entry: StrengthLogEntry) => {
  store.logs = [...store.logs, entry];
});
