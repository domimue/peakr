import type { CustomExercise, Routine, StrengthLog, StrengthSetup } from '@peakr/engine';
import { desc, eq } from 'drizzle-orm';

import { db } from '../db/client';
import { appSettings, customExercises, routines, strengthLogs } from '../db/schema';

/**
 * Local strength data: the chosen setup, own routines, custom exercises and logged sessions.
 * Screens use it through the TanStack Query hooks in `features/strength/queries.ts`; tests replace
 * it with the in-memory version in `__mocks__`.
 */

/** Setup without the library parts (routines and custom exercises have their own tables). */
export type StoredStrengthSetup = Omit<StrengthSetup, 'routines' | 'customExercises'>;

export interface StrengthLogEntry {
  id: string;
  date: string;
  title: string;
  sourceId: string | null;
  log: StrengthLog;
  createdAt: number;
}

const SETUP_KEY = 'strength_setup';
/** Enough history to find the last sets of every exercise of a session. */
const RECENT_LOGS = 60;

export async function getStrengthSetup(): Promise<StoredStrengthSetup | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, SETUP_KEY) });
  return row ? (JSON.parse(row.value) as StoredStrengthSetup) : null;
}

export async function saveStrengthSetup(setup: StoredStrengthSetup): Promise<void> {
  const value = JSON.stringify(setup);
  await db
    .insert(appSettings)
    .values({ key: SETUP_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function listRoutines(): Promise<Routine[]> {
  const rows = await db.select().from(routines).orderBy(desc(routines.updatedAt));
  return rows.map(({ id, name, durationMin, exercises }) => ({ id, name, durationMin, exercises }));
}

export async function saveRoutine(routine: Routine): Promise<void> {
  const row = { ...routine, updatedAt: Date.now() };
  await db.insert(routines).values(row).onConflictDoUpdate({ target: routines.id, set: row });
}

export async function deleteRoutine(id: string): Promise<void> {
  await db.delete(routines).where(eq(routines.id, id));
}

export async function listCustomExercises(): Promise<CustomExercise[]> {
  const rows = await db.select().from(customExercises).orderBy(customExercises.createdAt);
  return rows.map((r) => r.data);
}

export async function saveCustomExercise(exercise: CustomExercise): Promise<void> {
  await db
    .insert(customExercises)
    .values({ id: exercise.id, data: exercise, createdAt: Date.now() })
    .onConflictDoUpdate({ target: customExercises.id, set: { data: exercise } });
}

export async function listStrengthLogs(limit = RECENT_LOGS): Promise<StrengthLogEntry[]> {
  return db.select().from(strengthLogs).orderBy(desc(strengthLogs.createdAt)).limit(limit);
}

export async function saveStrengthLog(entry: StrengthLogEntry): Promise<void> {
  await db.insert(strengthLogs).values(entry);
}
