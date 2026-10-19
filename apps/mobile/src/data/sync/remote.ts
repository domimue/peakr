import type { SupabaseClient } from '@supabase/supabase-js';

import type { SyncPlan, SyncWorkout, Tombstone } from './types';

/**
 * Supabase side of the sync (tables `plans` and `workouts`, see supabase/migrations). Row Level
 * Security limits every query to the signed-in user; the server keeps the newer `updated_at` on
 * conflicting writes, so pushing an older version is harmless.
 */

const PAGE = 1000;
const PUSH_CHUNK = 200;

interface PlanRow {
  id: string;
  input: SyncPlan['input'];
  goal: SyncPlan['goal'];
  start_date: string;
  target_date: string | null;
  notes: SyncPlan['notes'];
  weeks: SyncPlan['weeks'];
  pauses: SyncPlan['pauses'];
  revision: number;
  deleted: boolean;
  created_at: string;
  updated_at: string;
  server_updated_at: string;
}

interface WorkoutRow {
  plan_id: string;
  id: string;
  date: string;
  status: SyncWorkout['status'];
  data: SyncWorkout['data'];
  deleted: boolean;
  updated_at: string;
  server_updated_at: string;
}

const iso = (ms: number) => new Date(ms).toISOString();

function fromPlanRow(row: PlanRow): SyncPlan {
  return {
    id: row.id,
    input: row.input,
    goal: row.goal,
    startDate: row.start_date,
    targetDate: row.target_date,
    notes: row.notes,
    weeks: row.weeks,
    pauses: row.pauses,
    revision: row.revision,
    deleted: row.deleted,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

function fromWorkoutRow(row: WorkoutRow): SyncWorkout {
  return {
    planId: row.plan_id,
    id: row.id,
    date: row.date,
    status: row.status,
    data: row.data,
    deleted: row.deleted,
    updatedAt: Date.parse(row.updated_at),
  };
}

export function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function pushPlan(client: SupabaseClient, userId: string, plan: SyncPlan) {
  const { error } = await client.from('plans').upsert(
    {
      user_id: userId,
      id: plan.id,
      input: plan.input,
      goal: plan.goal,
      start_date: plan.startDate,
      target_date: plan.targetDate,
      notes: plan.notes,
      weeks: plan.weeks,
      pauses: plan.pauses,
      revision: plan.revision,
      deleted: false,
      created_at: iso(plan.createdAt),
      updated_at: iso(plan.updatedAt),
    },
    { onConflict: 'user_id,id' },
  );
  check(error, 'push plan');
}

export async function pushWorkouts(
  client: SupabaseClient,
  userId: string,
  workouts: readonly SyncWorkout[],
) {
  for (let i = 0; i < workouts.length; i += PUSH_CHUNK) {
    const rows = workouts.slice(i, i + PUSH_CHUNK).map((w) => ({
      user_id: userId,
      plan_id: w.planId,
      id: w.id,
      date: w.date,
      status: w.status,
      data: w.data,
      deleted: false,
      updated_at: iso(w.updatedAt),
    }));
    const { error } = await client
      .from('workouts')
      .upsert(rows, { onConflict: 'user_id,plan_id,id' });
    check(error, 'push workouts');
  }
}

/** Marks deleted plans and workouts as deleted on the server (soft delete, so it syncs). */
export async function pushTombstones(
  client: SupabaseClient,
  userId: string,
  tombstones: readonly Tombstone[],
) {
  const deletedPlans = new Set(tombstones.filter((t) => t.entity === 'plan').map((t) => t.id));
  for (const t of tombstones) {
    if (t.entity !== 'plan') continue;
    const { error } = await client
      .from('plans')
      .update({ deleted: true, updated_at: iso(t.deletedAt) })
      .eq('user_id', userId)
      .eq('id', t.id);
    check(error, 'delete plan');
  }
  // Group workout deletions by plan and time: usually one statement per save.
  const groups = new Map<string, { planId: string; deletedAt: number; ids: string[] }>();
  for (const t of tombstones) {
    if (t.entity !== 'workout' || deletedPlans.has(t.planId)) continue;
    const key = `${t.planId}|${t.deletedAt}`;
    const group = groups.get(key) ?? { planId: t.planId, deletedAt: t.deletedAt, ids: [] };
    group.ids.push(t.id);
    groups.set(key, group);
  }
  for (const { planId, deletedAt, ids } of groups.values()) {
    for (let i = 0; i < ids.length; i += PUSH_CHUNK) {
      const { error } = await client
        .from('workouts')
        .update({ deleted: true, updated_at: iso(deletedAt) })
        .eq('user_id', userId)
        .eq('plan_id', planId)
        .in('id', ids.slice(i, i + PUSH_CHUNK));
      check(error, 'delete workouts');
    }
  }
}

export interface RemoteChanges {
  plans: SyncPlan[];
  workouts: SyncWorkout[];
  /** Newest `server_updated_at` seen – the next pull starts from here. */
  cursor: string | null;
}

/** Rows written in parallel can commit slightly out of order; re-reading a minute is harmless. */
const OVERLAP_MS = 60_000;

export function since(cursor: string | null): string {
  return cursor ? iso(Date.parse(cursor) - OVERLAP_MS) : iso(0);
}

export async function fetchPaged<T extends { server_updated_at: string }>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    check(error, what);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}

export async function pullChanges(
  client: SupabaseClient,
  cursor: string | null,
): Promise<RemoteChanges> {
  const after = since(cursor);
  const planRows = await fetchPaged<PlanRow>(
    (from, to) =>
      client
        .from('plans')
        .select('*')
        .gt('server_updated_at', after)
        .order('server_updated_at')
        .order('id')
        .range(from, to),
    'pull plans',
  );
  const workoutRows = await fetchPaged<WorkoutRow>(
    (from, to) =>
      client
        .from('workouts')
        .select('plan_id, id, date, status, data, deleted, updated_at, server_updated_at')
        .gt('server_updated_at', after)
        .order('server_updated_at')
        .order('plan_id')
        .order('id')
        .range(from, to),
    'pull workouts',
  );
  let newest = cursor;
  for (const row of [...planRows, ...workoutRows]) {
    if (!newest || Date.parse(row.server_updated_at) > Date.parse(newest))
      newest = row.server_updated_at;
  }
  return {
    plans: planRows.map(fromPlanRow),
    workouts: workoutRows.map(fromWorkoutRow),
    cursor: newest,
  };
}

/** All workouts of one plan (when another device's plan replaces the local one). */
export async function pullPlanWorkouts(
  client: SupabaseClient,
  planId: string,
): Promise<SyncWorkout[]> {
  const rows = await fetchPaged<WorkoutRow>(
    (from, to) =>
      client
        .from('workouts')
        .select('plan_id, id, date, status, data, deleted, updated_at, server_updated_at')
        .eq('plan_id', planId)
        .eq('deleted', false)
        .order('id')
        .range(from, to),
    'pull plan workouts',
  );
  return rows.map(fromWorkoutRow);
}
