import type { LocalVersion, SyncPlan, SyncWorkout } from './types';

/**
 * Pure conflict rules of the sync, "last write wins":
 * - Each workout is its own unit. The version with the newer `updatedAt` wins, whether it is an
 *   edit or a deletion (a local tombstone counts as a version). Equal versions are the same edit.
 * - The plan (meta, weeks, pauses) is one unit with the same rule.
 * - A device holds one active plan. A different plan from the server replaces the local one if
 *   it was changed more recently. Deleting a plan (it was replaced by a new quiz result) is final.
 */

/** True when the remote version should replace the local one. */
export function remoteWins(local: number | undefined, remote: number): boolean {
  return local === undefined || remote > local;
}

export type PlanDecision =
  | { kind: 'none' }
  /** Same plan, newer on the server: take its meta, weeks and pauses. */
  | { kind: 'update'; plan: SyncPlan }
  /** Another plan is newer: replace the local plan with it (and load all its workouts). */
  | { kind: 'adopt'; plan: SyncPlan }
  /** The local plan was deleted on another device. */
  | { kind: 'delete'; planId: string };

/**
 * Decides what to do with the local plan given the plans that changed on the server.
 * `tombstones` holds plans deleted on this device (id → deletedAt) that the server may still list.
 */
export function resolvePlan(
  local: LocalVersion | null,
  tombstones: ReadonlyMap<string, number>,
  remote: readonly SyncPlan[],
): PlanDecision {
  let current = local;
  let decision: PlanDecision = { kind: 'none' };
  // Oldest first, so the most recent plan is decided last and wins.
  for (const plan of [...remote].sort((a, b) => a.updatedAt - b.updatedAt)) {
    if (current && plan.id === current.id) {
      if (plan.deleted) {
        decision = { kind: 'delete', planId: plan.id };
        current = null;
      } else if (remoteWins(current.updatedAt, plan.updatedAt)) {
        decision = decision.kind === 'adopt' ? { kind: 'adopt', plan } : { kind: 'update', plan };
        current = { id: plan.id, updatedAt: plan.updatedAt };
      }
      continue;
    }
    if (plan.deleted) continue;
    // Deleted here, and the deletion is final.
    if (tombstones.has(plan.id)) continue;
    if (current && !remoteWins(current.updatedAt, plan.updatedAt)) continue;
    decision = { kind: 'adopt', plan };
    current = { id: plan.id, updatedAt: plan.updatedAt };
  }
  return decision;
}

export interface WorkoutChanges {
  /** Remote workouts to write locally (insert or replace). */
  upserts: SyncWorkout[];
  /** Ids of local workouts to delete. */
  deletes: string[];
}

/**
 * Per-workout merge for one plan. `local` maps workout id → version of the local row or of its
 * tombstone. Remote rows of other plans are ignored.
 */
export function resolveWorkouts(
  planId: string,
  local: ReadonlyMap<string, number>,
  remote: readonly SyncWorkout[],
): WorkoutChanges {
  // Paged pulls can return a row twice; keep the newest of each.
  const newest = new Map<string, SyncWorkout>();
  for (const row of remote) {
    if (row.planId !== planId) continue;
    const seen = newest.get(row.id);
    if (!seen || row.updatedAt > seen.updatedAt) newest.set(row.id, row);
  }
  const upserts: SyncWorkout[] = [];
  const deletes: string[] = [];
  for (const row of newest.values()) {
    const version = local.get(row.id);
    if (!remoteWins(version, row.updatedAt)) continue;
    if (row.deleted) {
      if (version !== undefined) deletes.push(row.id);
    } else {
      upserts.push(row);
    }
  }
  return { upserts, deletes };
}

/**
 * Archived plans: each row is its own unit, the newer `updatedAt` wins (a soft delete by "undo"
 * included). `local` maps archive id → local version. Returns the remote rows to write.
 */
export function resolveArchive<T extends { id: string; updatedAt: number }>(
  local: ReadonlyMap<string, number>,
  remote: readonly T[],
): T[] {
  const newest = new Map<string, T>();
  for (const row of remote) {
    const seen = newest.get(row.id);
    if (!seen || row.updatedAt > seen.updatedAt) newest.set(row.id, row);
  }
  return [...newest.values()].filter((row) => remoteWins(local.get(row.id), row.updatedAt));
}
