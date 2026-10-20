import type {
  CustomExercise,
  GymRoutine,
  GymSession,
  GymSessionSource,
  GymSet,
  RoutineFolder,
} from '@peakr/engine';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { db } from '../db/client';
import {
  appSettings,
  gymExercises,
  gymRoutines,
  gymSessions,
  gymSets,
  routineFolders,
} from '../db/schema';

/**
 * Local gym data (CLAUDE.md "Gym"): custom exercises, routine folders, routines, sessions and sets.
 * Offline first – everything is written to SQLite right away. Deletes are soft (`deleted_at`) so
 * they can be synced later. Screens use it through `features/gym/queries.ts`; tests replace it with
 * the in-memory version in `__mocks__`.
 */

const SYNC_COLUMNS = new Set(['updatedAt', 'deletedAt']);

/** Drops `null` and sync columns so rows read back as the engine's optional fields. */
function fromRow<T extends object>(row: object): T {
  return Object.fromEntries(
    Object.entries(row).filter(([k, v]) => v !== null && !SYNC_COLUMNS.has(k)),
  ) as T;
}

const IMPORT_NAMES_KEY = 'gym_import_names';
/** Sessions loaded for history, last-time pre-fill and records. */
const HISTORY_SESSIONS = 200;

// ---------------------------------------------------------------------------------------------
// Exercises

export async function listGymExercises(): Promise<CustomExercise[]> {
  const rows = await db
    .select()
    .from(gymExercises)
    .where(isNull(gymExercises.deletedAt))
    .orderBy(asc(gymExercises.name));
  return rows.map((r) => r.data);
}

export async function saveGymExercise(exercise: CustomExercise): Promise<void> {
  const row = {
    id: exercise.id,
    name: exercise.name,
    data: exercise,
    updatedAt: Date.now(),
    deletedAt: null,
  };
  await db
    .insert(gymExercises)
    .values(row)
    .onConflictDoUpdate({ target: gymExercises.id, set: row });
}

export async function deleteGymExercise(id: string): Promise<void> {
  const now = Date.now();
  await db
    .update(gymExercises)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(gymExercises.id, id));
}

// ---------------------------------------------------------------------------------------------
// Folders and routines

export async function listFolders(): Promise<RoutineFolder[]> {
  const rows = await db
    .select({ id: routineFolders.id, name: routineFolders.name, position: routineFolders.position })
    .from(routineFolders)
    .where(isNull(routineFolders.deletedAt))
    .orderBy(asc(routineFolders.position));
  return rows;
}

export async function saveFolder(folder: RoutineFolder): Promise<void> {
  const row = { ...folder, updatedAt: Date.now(), deletedAt: null };
  await db
    .insert(routineFolders)
    .values(row)
    .onConflictDoUpdate({ target: routineFolders.id, set: row });
}

/** Deletes a folder; its routines are kept and move to "no folder". */
export async function deleteFolder(id: string): Promise<void> {
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(routineFolders)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(routineFolders.id, id))
      .run();
    tx.update(gymRoutines)
      .set({ folderId: null, updatedAt: now })
      .where(eq(gymRoutines.folderId, id))
      .run();
  });
}

function routineRow(r: GymRoutine, now: number) {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? null,
    folderId: r.folderId ?? null,
    position: r.position,
    archivedAt: r.archivedAt ?? null,
    durationMin: r.durationMin ?? null,
    exercises: r.exercises,
    updatedAt: now,
    deletedAt: null,
  };
}

/** All routines that are not deleted (archived ones included), in list order. */
export async function listGymRoutines(): Promise<GymRoutine[]> {
  const rows = await db
    .select()
    .from(gymRoutines)
    .where(isNull(gymRoutines.deletedAt))
    .orderBy(asc(gymRoutines.position), asc(gymRoutines.name));
  return rows.map((r) => fromRow<GymRoutine>(r));
}

/** Saves one or more routines in one transaction (reordering writes the whole list). */
export async function saveGymRoutines(list: readonly GymRoutine[]): Promise<void> {
  const now = Date.now();
  db.transaction((tx) => {
    for (const r of list) {
      const row = routineRow(r, now);
      tx.insert(gymRoutines)
        .values(row)
        .onConflictDoUpdate({ target: gymRoutines.id, set: row })
        .run();
    }
  });
}

export async function saveGymRoutine(routine: GymRoutine): Promise<void> {
  await saveGymRoutines([routine]);
}

export async function deleteGymRoutine(id: string): Promise<void> {
  const now = Date.now();
  await db
    .update(gymRoutines)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(gymRoutines.id, id));
}

/** A starter split (folder and routines) in one transaction. */
export async function saveFolderWithRoutines(
  folder: RoutineFolder,
  list: readonly GymRoutine[],
): Promise<void> {
  await saveGymImport({ exercises: [], folder, routines: list, sessions: [], sets: [] });
}

// ---------------------------------------------------------------------------------------------
// Sessions and sets

function sessionRow(s: GymSession, now: number) {
  return {
    id: s.id,
    date: s.date,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? null,
    title: s.title,
    kind: s.kind,
    durationMin: s.durationMin ?? null,
    sessionRpe: s.sessionRpe ?? null,
    legs: s.legs ?? null,
    notes: s.notes ?? null,
    routineId: s.routineId ?? null,
    plannedWorkoutId: s.plannedWorkoutId ?? null,
    sourceId: s.sourceId ?? null,
    source: s.source,
    externalId: s.externalId ?? null,
    updatedAt: now,
    deletedAt: null,
  };
}

function setRow(s: GymSet, now: number) {
  return {
    id: s.id,
    sessionId: s.sessionId,
    exerciseId: s.exerciseId,
    setIndex: s.setIndex,
    setType: s.setType,
    weightKg: s.weightKg ?? null,
    reps: s.reps ?? null,
    rpe: s.rpe ?? null,
    durationSec: s.durationSec ?? null,
    distanceM: s.distanceM ?? null,
    completed: s.completed,
    loggedAt: s.loggedAt,
    notes: s.notes ?? null,
    updatedAt: now,
    deletedAt: null,
  };
}

const toSession = (r: typeof gymSessions.$inferSelect) => fromRow<GymSession>(r);
const toSet = (r: typeof gymSets.$inferSelect) => fromRow<GymSet>(r);

/** Saves a session with exactly these sets (sets removed in the editor are soft-deleted). */
export async function saveGymSession(session: GymSession, sets: readonly GymSet[]): Promise<void> {
  const now = Date.now();
  db.transaction((tx) => {
    const row = sessionRow(session, now);
    tx.insert(gymSessions)
      .values(row)
      .onConflictDoUpdate({ target: gymSessions.id, set: row })
      .run();
    tx.update(gymSets)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(gymSets.sessionId, session.id), isNull(gymSets.deletedAt)))
      .run();
    for (const s of sets) {
      const r = setRow(s, now);
      tx.insert(gymSets).values(r).onConflictDoUpdate({ target: gymSets.id, set: r }).run();
    }
  });
}

export async function deleteGymSession(id: string): Promise<void> {
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(gymSessions)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(gymSessions.id, id))
      .run();
    tx.update(gymSets)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(gymSets.sessionId, id))
      .run();
  });
}

export interface GymHistory {
  /** Most recent first. */
  sessions: GymSession[];
  sets: GymSet[];
}

/** The most recent sessions with their sets (history, records, last-time pre-fill). */
export async function getGymHistory(limit = HISTORY_SESSIONS): Promise<GymHistory> {
  const sessionRows = await db
    .select()
    .from(gymSessions)
    .where(isNull(gymSessions.deletedAt))
    .orderBy(desc(gymSessions.startedAt))
    .limit(limit);
  const ids = sessionRows.map((s) => s.id);
  const setRows =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(gymSets)
          .where(and(inArray(gymSets.sessionId, ids), isNull(gymSets.deletedAt)))
          .orderBy(asc(gymSets.sessionId), asc(gymSets.setIndex));
  return { sessions: sessionRows.map(toSession), sets: setRows.map(toSet) };
}

/** External ids of sessions imported from a source before (repeat imports skip them). */
export async function listExternalIds(source: GymSessionSource): Promise<Set<string>> {
  const rows = await db
    .select({ externalId: gymSessions.externalId })
    .from(gymSessions)
    .where(
      and(
        eq(gymSessions.source, source),
        isNotNull(gymSessions.externalId),
        isNull(gymSessions.deletedAt),
      ),
    );
  return new Set(rows.flatMap((r) => (r.externalId ? [r.externalId] : [])));
}

export interface GymImport {
  exercises: readonly CustomExercise[];
  folder?: RoutineFolder;
  routines: readonly GymRoutine[];
  sessions: readonly GymSession[];
  sets: readonly GymSet[];
}

/** Writes an import (or the Phase 3 migration) in one transaction: all of it or nothing. */
export async function saveGymImport(data: GymImport): Promise<void> {
  db.transaction((tx) => writeImport(tx, data, Date.now()));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CHUNK = 100;
function chunks<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

export function writeImport(tx: Tx, data: GymImport, now: number): void {
  for (const e of data.exercises) {
    const row = { id: e.id, name: e.name, data: e, updatedAt: now, deletedAt: null };
    tx.insert(gymExercises)
      .values(row)
      .onConflictDoUpdate({ target: gymExercises.id, set: row })
      .run();
  }
  if (data.folder) {
    const row = { ...data.folder, updatedAt: now, deletedAt: null };
    tx.insert(routineFolders)
      .values(row)
      .onConflictDoUpdate({ target: routineFolders.id, set: row })
      .run();
  }
  for (const r of data.routines) {
    const row = routineRow(r, now);
    tx.insert(gymRoutines)
      .values(row)
      .onConflictDoUpdate({ target: gymRoutines.id, set: row })
      .run();
  }
  for (const part of chunks(data.sessions)) {
    tx.insert(gymSessions)
      .values(part.map((s) => sessionRow(s, now)))
      .onConflictDoNothing()
      .run();
  }
  for (const part of chunks(data.sets)) {
    tx.insert(gymSets)
      .values(part.map((s) => setRow(s, now)))
      .onConflictDoNothing()
      .run();
  }
}

// ---------------------------------------------------------------------------------------------
// Import name memory

/** Export names the user already matched (normalised name → exercise id). */
export async function getImportNames(): Promise<Record<string, string>> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, IMPORT_NAMES_KEY),
  });
  return row ? (JSON.parse(row.value) as Record<string, string>) : {};
}

export async function saveImportNames(names: Record<string, string>): Promise<void> {
  const value = JSON.stringify(names);
  await db
    .insert(appSettings)
    .values({ key: IMPORT_NAMES_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
