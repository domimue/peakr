import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client';
import {
  activities,
  activityLinks,
  activityStreams,
  appSettings,
  baselineActivities,
  customExercises,
  gymExercises,
  gymRoutines,
  gymSessions,
  gymSets,
  planPauses,
  plans,
  planWeeks,
  planWorkouts,
  routineFolders,
  routines,
  routes,
  strengthLogs,
  syncTombstones,
} from '../db/schema';
import { newId } from '../ids';
import { BASELINE_KEY } from '../repositories/baseline-repository';
import type { LocalVersion, PendingChanges, SyncPlan, SyncWorkout, Tombstone } from './types';

/**
 * SQLite side of the sync: reads what has to be pushed, records what was pushed and writes what
 * came from the server. Rows written from the server are never dirty and leave no tombstones.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CHUNK = 100;

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

// --- Sync state (cursor, account) ------------------------------------------------------------

/** Pull cursors (plans + workouts, activities) and the account the local data belongs to. */
export type SyncKey =
  | 'sync.cursor'
  | 'sync.activitiesCursor'
  | 'sync.routesCursor'
  | 'sync.streamsCursor'
  | 'sync.stravaRoutesCursor'
  | 'sync.userId';
const SYNC_KEYS: SyncKey[] = [
  'sync.cursor',
  'sync.activitiesCursor',
  'sync.routesCursor',
  'sync.streamsCursor',
  'sync.stravaRoutesCursor',
  'sync.userId',
];

export async function getSyncValue(key: SyncKey): Promise<string | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  return row?.value ?? null;
}

export async function setSyncValue(key: SyncKey, value: string) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

// --- Push ------------------------------------------------------------------------------------

function readPlan(tx: Tx, planId: string): SyncPlan | null {
  const plan = tx.select().from(plans).where(eq(plans.id, planId)).get();
  if (!plan) return null;
  const weeks = tx
    .select()
    .from(planWeeks)
    .where(eq(planWeeks.planId, planId))
    .orderBy(asc(planWeeks.weekIndex))
    .all();
  const pauses = tx
    .select()
    .from(planPauses)
    .where(eq(planPauses.planId, planId))
    .orderBy(asc(planPauses.startDate))
    .all();
  return {
    id: plan.id,
    input: plan.input,
    goal: plan.goal,
    startDate: plan.startDate,
    targetDate: plan.targetDate,
    notes: plan.notes,
    weeks: weeks.map(({ planId: _, ...week }) => week),
    pauses: pauses.map(({ reason, startDate, endDate }) => ({ reason, startDate, endDate })),
    revision: plan.revision,
    deleted: false,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export function readPendingChanges(): PendingChanges {
  return db.transaction((tx) => {
    const dirtyPlan = tx.select({ id: plans.id }).from(plans).where(eq(plans.dirty, true)).get();
    const workouts = tx
      .select()
      .from(planWorkouts)
      .where(eq(planWorkouts.dirty, true))
      .all()
      .map(({ dirty: _, ...row }) => ({ ...row, deleted: false }));
    const tombstones: Tombstone[] = tx.select().from(syncTombstones).all();
    return { plan: dirtyPlan ? readPlan(tx, dirtyPlan.id) : null, workouts, tombstones };
  });
}

/**
 * Clears dirty flags and tombstones of what was pushed. A row edited again while the push was
 * running has a newer `updated_at` and stays dirty.
 */
export function markPushed(pushed: PendingChanges): void {
  db.transaction((tx) => {
    if (pushed.plan) {
      tx.update(plans)
        .set({ dirty: false })
        .where(and(eq(plans.id, pushed.plan.id), eq(plans.updatedAt, pushed.plan.updatedAt)))
        .run();
    }
    for (const w of pushed.workouts) {
      tx.update(planWorkouts)
        .set({ dirty: false })
        .where(
          and(
            eq(planWorkouts.planId, w.planId),
            eq(planWorkouts.id, w.id),
            eq(planWorkouts.updatedAt, w.updatedAt),
          ),
        )
        .run();
    }
    for (const t of pushed.tombstones) {
      tx.delete(syncTombstones)
        .where(
          and(
            eq(syncTombstones.entity, t.entity),
            eq(syncTombstones.planId, t.planId),
            eq(syncTombstones.id, t.id),
            eq(syncTombstones.deletedAt, t.deletedAt),
          ),
        )
        .run();
    }
  });
}

// --- Pull ------------------------------------------------------------------------------------

export interface LocalVersions {
  plan: LocalVersion | null;
  /** Plans deleted on this device: id → deletedAt. */
  planTombstones: Map<string, number>;
  /** Workouts of the local plan and their tombstones: id → updatedAt / deletedAt. */
  workouts: Map<string, number>;
}

export function readLocalVersions(): LocalVersions {
  return db.transaction((tx) => {
    const plan = tx.select({ id: plans.id, updatedAt: plans.updatedAt }).from(plans).get() ?? null;
    const tombstones = tx.select().from(syncTombstones).all();
    const workouts = new Map<string, number>();
    if (plan) {
      for (const t of tombstones) {
        if (t.entity === 'workout' && t.planId === plan.id) workouts.set(t.id, t.deletedAt);
      }
      const rows = tx
        .select({ id: planWorkouts.id, updatedAt: planWorkouts.updatedAt })
        .from(planWorkouts)
        .where(eq(planWorkouts.planId, plan.id))
        .all();
      for (const row of rows) workouts.set(row.id, row.updatedAt);
    }
    const planTombstones = new Map(
      tombstones.filter((t) => t.entity === 'plan').map((t) => [t.id, t.deletedAt]),
    );
    return { plan, planTombstones, workouts };
  });
}

function writePlanParts(tx: Tx, plan: SyncPlan): void {
  tx.delete(planWeeks).where(eq(planWeeks.planId, plan.id)).run();
  tx.delete(planPauses).where(eq(planPauses.planId, plan.id)).run();
  const weekRows = plan.weeks.map((w) => ({ planId: plan.id, ...w }));
  const pauseRows = plan.pauses.map((p) => ({ id: newId(), planId: plan.id, ...p }));
  for (const rows of chunks(weekRows)) tx.insert(planWeeks).values(rows).run();
  for (const rows of chunks(pauseRows)) tx.insert(planPauses).values(rows).run();
}

function writeWorkouts(tx: Tx, rows: readonly SyncWorkout[]): void {
  for (const part of chunks(rows)) {
    for (const w of part) {
      const values = {
        planId: w.planId,
        id: w.id,
        date: w.date,
        status: w.status,
        data: w.data,
        updatedAt: w.updatedAt,
        dirty: false,
      };
      tx.insert(planWorkouts)
        .values(values)
        .onConflictDoUpdate({ target: [planWorkouts.planId, planWorkouts.id], set: values })
        .run();
    }
    tx.delete(syncTombstones)
      .where(
        and(
          eq(syncTombstones.entity, 'workout'),
          inArray(
            syncTombstones.id,
            part.map((w) => w.id),
          ),
        ),
      )
      .run();
  }
}

function clearPlans(tx: Tx): void {
  tx.delete(planWorkouts).run();
  tx.delete(planWeeks).run();
  tx.delete(planPauses).run();
  tx.delete(plans).run();
}

/** The server's newer version of the local plan's meta, weeks and pauses. */
export function updatePlanFromServer(plan: SyncPlan): void {
  db.transaction((tx) => {
    tx.update(plans)
      .set({
        input: plan.input,
        goal: plan.goal,
        startDate: plan.startDate,
        targetDate: plan.targetDate,
        notes: plan.notes,
        revision: plan.revision,
        updatedAt: plan.updatedAt,
        dirty: false,
      })
      .where(eq(plans.id, plan.id))
      .run();
    writePlanParts(tx, plan);
  });
}

/**
 * Replaces the local plan with another plan from the server. The replaced local plan gets a
 * tombstone, so the server learns it lost.
 */
export function adoptPlanFromServer(plan: SyncPlan, workouts: readonly SyncWorkout[]): void {
  const now = Date.now();
  db.transaction((tx) => {
    for (const old of tx.select({ id: plans.id }).from(plans).all()) {
      if (old.id === plan.id) continue;
      tx.insert(syncTombstones)
        .values({ entity: 'plan', planId: old.id, id: old.id, deletedAt: now })
        .onConflictDoNothing()
        .run();
    }
    tx.delete(syncTombstones).where(eq(syncTombstones.entity, 'workout')).run();
    clearPlans(tx);
    tx.insert(plans)
      .values({
        id: plan.id,
        input: plan.input,
        goal: plan.goal,
        startDate: plan.startDate,
        targetDate: plan.targetDate,
        notes: plan.notes,
        revision: plan.revision,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        dirty: false,
      })
      .run();
    writePlanParts(tx, plan);
    writeWorkouts(
      tx,
      workouts.filter((w) => w.planId === plan.id && !w.deleted),
    );
  });
}

/** The local plan was deleted on another device. */
export function deletePlanFromServer(planId: string): void {
  db.transaction((tx) => {
    tx.delete(planWorkouts).where(eq(planWorkouts.planId, planId)).run();
    tx.delete(planWeeks).where(eq(planWeeks.planId, planId)).run();
    tx.delete(planPauses).where(eq(planPauses.planId, planId)).run();
    tx.delete(plans).where(eq(plans.id, planId)).run();
    tx.delete(syncTombstones).where(eq(syncTombstones.planId, planId)).run();
  });
}

export function applyWorkoutsFromServer(
  planId: string,
  upserts: readonly SyncWorkout[],
  deletes: readonly string[],
): void {
  db.transaction((tx) => {
    writeWorkouts(tx, upserts);
    for (const ids of chunks(deletes)) {
      tx.delete(planWorkouts)
        .where(and(eq(planWorkouts.planId, planId), inArray(planWorkouts.id, ids)))
        .run();
      tx.delete(syncTombstones)
        .where(
          and(
            eq(syncTombstones.entity, 'workout'),
            eq(syncTombstones.planId, planId),
            inArray(syncTombstones.id, ids),
          ),
        )
        .run();
    }
  });
}

/**
 * Another account signs in on this device: its data must not mix with the previous one's.
 * Removes the synced data and the sync state (no tombstones – nothing is deleted on a server).
 */
export function clearSyncedData(): void {
  db.transaction((tx) => {
    clearPlans(tx);
    tx.delete(syncTombstones).run();
    // Imported activities and the route library belong to the account too.
    tx.delete(activities).run();
    tx.delete(activityLinks).run();
    tx.delete(activityStreams).run();
    tx.delete(routes).run();
    tx.delete(baselineActivities).run();
    tx.delete(appSettings)
      .where(inArray(appSettings.key, [...SYNC_KEYS, BASELINE_KEY]))
      .run();
  });
}

/**
 * After the account was deleted: removes everything Peakr stored on this device – plan,
 * activities, strength data, quiz progress, settings and sync state. The schema stays.
 */
export function clearAllLocalData(): void {
  db.transaction((tx) => {
    clearPlans(tx);
    tx.delete(syncTombstones).run();
    tx.delete(activities).run();
    tx.delete(activityLinks).run();
    tx.delete(activityStreams).run();
    tx.delete(routes).run();
    tx.delete(baselineActivities).run();
    tx.delete(routines).run();
    tx.delete(customExercises).run();
    tx.delete(strengthLogs).run();
    tx.delete(gymExercises).run();
    tx.delete(routineFolders).run();
    tx.delete(gymRoutines).run();
    tx.delete(gymSessions).run();
    tx.delete(gymSets).run();
    tx.delete(appSettings).run();
  });
}
