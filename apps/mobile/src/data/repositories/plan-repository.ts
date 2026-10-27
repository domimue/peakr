import {
  normalizePlan,
  planEnded,
  planOutcome,
  type Plan,
  type PlanState,
  type Workout,
  type WorkoutStatus,
} from '@peakr/engine';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client';
import {
  activities,
  activityLinks,
  planArchive,
  planPauses,
  plans,
  planWeeks,
  planWorkouts,
  syncTombstones,
  type StoredPlanInput,
} from '../db/schema';
import { newId, todayIso } from '../ids';
import { notifyLocalChange } from '../sync/changes';

// Plan history reads, here so that screens and their mocks have one plan repository.
export {
  getArchivedPlan,
  listArchivedPlans,
  saveArchiveReview,
  type ArchivedPlan,
} from './plan-archive-repository';

/**
 * The local training plan: one active plan with its weeks, workouts (incl. done / skipped) and
 * pauses. The engine edits a `PlanState` in memory; `savePlanState` writes the result back in one
 * transaction. Screens use it through `features/plan/queries.ts`; tests use `__mocks__`.
 *
 * Sync bookkeeping (Phase 6): every save marks the plan and each changed workout as dirty with a
 * new `updated_at`; removed workouts and replaced plans leave a tombstone. `data/sync` pushes
 * them and applies server changes ("last write wins" per workout).
 *
 * Plan history: a replaced or ended plan is archived first (`plan-archive-repository`) – its done
 * and skipped sessions stay the user's history – and only then removed from the active tables.
 */

export interface StoredPlan {
  id: string;
  input: StoredPlanInput;
  state: PlanState;
}

/** SQLite allows a limited number of bound variables per statement. */
const CHUNK = 100;

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

export async function getPlan(): Promise<StoredPlan | null> {
  const plan = await db.query.plans.findFirst();
  if (!plan) return null;
  const [weeks, workouts, pauses] = await Promise.all([
    db
      .select()
      .from(planWeeks)
      .where(eq(planWeeks.planId, plan.id))
      .orderBy(asc(planWeeks.weekIndex)),
    db
      .select()
      .from(planWorkouts)
      .where(eq(planWorkouts.planId, plan.id))
      .orderBy(asc(planWorkouts.date)),
    db
      .select()
      .from(planPauses)
      .where(eq(planPauses.planId, plan.id))
      .orderBy(asc(planPauses.startDate)),
  ]);
  const byWeek = new Map<number, Workout[]>();
  const status: Record<string, WorkoutStatus> = {};
  for (const row of workouts) {
    const week = weeks.find((w) => w.startDate <= row.date && row.date < addDays(w.startDate, 7));
    if (!week) continue;
    byWeek.set(week.weekIndex, [...(byWeek.get(week.weekIndex) ?? []), row.data]);
    if (row.status !== 'planned') status[row.id] = row.status;
  }
  const value: Plan = {
    goal: plan.goal,
    startDate: plan.startDate,
    targetDate: plan.targetDate,
    notes: plan.notes,
    weeks: weeks.map((w) => ({
      index: w.weekIndex,
      // Number, distance and kind are derived from the workouts by `normalizePlan` below.
      number: w.weekIndex + 1,
      distanceKm: 0,
      kind: 'normal' as const,
      startDate: w.startDate,
      phase: w.phase,
      isRecovery: w.isRecovery,
      isPartial: w.isPartial,
      targetLoad: w.targetLoad,
      load: w.load,
      minutes: w.minutes,
      hardShare: w.hardShare,
      notes: w.notes,
      workouts: byWeek.get(w.weekIndex) ?? [],
    })),
  };
  return {
    id: plan.id,
    input: plan.input,
    state: {
      // Derived UI fields (workout types, week figures) are computed again on every load, so plans
      // stored before they existed get them without a migration.
      plan: normalizePlan(value, plan.input.profile),
      status,
      revision: plan.revision,
      pauses: pauses.map(({ reason, startDate, endDate }) => ({ reason, startDate, endDate })),
    },
  };
}

/**
 * Starts a new plan. An existing plan is archived first (outcome `replaced` before its end,
 * `completed` / `finished` after it) – nothing the user did is lost.
 */
export async function createPlan(
  input: StoredPlanInput,
  plan: Plan,
  today = todayIso(),
): Promise<string> {
  const current = await getPlan();
  const id = newId();
  const now = Date.now();
  db.transaction((tx) => {
    if (current) archive(tx, current, today, now);
    removeAllPlans(tx, now);
    insertPlanRow(tx, id, input, plan, 0, now);
  });
  await savePlanState(id, { plan, status: {}, pauses: [], revision: 0 });
  return id;
}

/**
 * A plan whose last day has passed is archived on its own (outcome `completed` or `finished`);
 * the app then offers to create the next one. Returns the archived plan's id, or null.
 */
export async function archiveEndedPlan(today = todayIso()): Promise<string | null> {
  const current = await getPlan();
  if (!current || !planEnded(current.state, today)) return null;
  const now = Date.now();
  db.transaction((tx) => {
    archive(tx, current, today, now);
    removeAllPlans(tx, now);
  });
  notifyLocalChange();
  return current.id;
}

/**
 * The plan that "undo" would bring back: archived today, and the active plan (if any) is the one
 * that replaced it.
 */
export async function undoablePlan(today = todayIso()): Promise<{ id: string } | null> {
  const archived = await db.query.planArchive.findFirst({
    where: eq(planArchive.deleted, false),
    orderBy: (a, { desc }) => [desc(a.archivedAt)],
  });
  if (!archived || todayIso(new Date(archived.archivedAt)) !== today) return null;
  const current = await db.query.plans.findFirst();
  if (current && current.createdAt < archived.archivedAt) return null;
  return { id: archived.id };
}

/**
 * Same-day undo of "Create a new plan": the new plan is removed and the archived one is active
 * again with everything it had (a new id – the old one is deleted on the server for good).
 * Activities matched to the discarded plan are matched again against the restored one.
 */
export async function undoNewPlan(today = todayIso()): Promise<string | null> {
  const target = await undoablePlan(today);
  if (!target) return null;
  const row = await db.query.planArchive.findFirst({ where: eq(planArchive.id, target.id) });
  if (!row) return null;
  const discarded = await db.query.plans.findFirst();
  const id = newId();
  const now = Date.now();
  const { state } = row;
  db.transaction((tx) => {
    if (discarded) {
      const links = tx
        .select({ key: activityLinks.activityKey })
        .from(activityLinks)
        .where(eq(activityLinks.planId, discarded.id))
        .all();
      for (const { key } of links) {
        const split = key.indexOf(':');
        tx.update(activities)
          .set({ handled: false })
          .where(
            and(
              eq(activities.source, key.slice(0, split) as typeof activities.$inferSelect.source),
              eq(activities.externalId, key.slice(split + 1)),
            ),
          )
          .run();
      }
      tx.delete(activityLinks).where(eq(activityLinks.planId, discarded.id)).run();
    }
    removeAllPlans(tx, now);
    insertPlanRow(tx, id, row.input, state.plan, state.revision, now);
    tx.update(activityLinks).set({ planId: id }).where(eq(activityLinks.planId, row.id)).run();
    tx.update(planArchive)
      .set({ deleted: true, updatedAt: now, dirty: true })
      .where(eq(planArchive.id, row.id))
      .run();
  });
  await savePlanState(id, state);
  return id;
}

/** Writes weeks, workouts, statuses and pauses of the plan (full replace, one transaction). */
export async function savePlanState(
  planId: string,
  state: PlanState,
  input?: StoredPlanInput,
): Promise<void> {
  const { plan } = state;
  const weekRows = plan.weeks.map((w) => ({
    planId,
    weekIndex: w.index,
    startDate: w.startDate,
    phase: w.phase,
    isRecovery: w.isRecovery,
    isPartial: w.isPartial,
    targetLoad: w.targetLoad,
    load: w.load,
    minutes: w.minutes,
    hardShare: w.hardShare,
    notes: w.notes,
  }));
  const now = Date.now();
  const pauseRows = state.pauses.map((p) => ({ id: newId(), planId, ...p }));
  db.transaction((tx) => {
    const previous = new Map(
      tx
        .select()
        .from(planWorkouts)
        .where(eq(planWorkouts.planId, planId))
        .all()
        .map((row) => [row.id, row]),
    );
    const workoutRows = plan.weeks.flatMap((w) =>
      w.workouts.map((x) => {
        const status = state.status[x.id] ?? ('planned' as const);
        const old = previous.get(x.id);
        const unchanged =
          old !== undefined &&
          old.date === x.date &&
          old.status === status &&
          JSON.stringify(old.data) === JSON.stringify(x);
        return {
          planId,
          id: x.id,
          date: x.date,
          status,
          data: x,
          // Unchanged workouts keep their version, so an edit on another device can still win.
          updatedAt: unchanged ? old.updatedAt : Math.max(now, (old?.updatedAt ?? 0) + 1),
          dirty: unchanged ? old.dirty : true,
        };
      }),
    );
    const kept = new Set(workoutRows.map((r) => r.id));
    const removed = [...previous.keys()].filter((id) => !kept.has(id));
    const added = workoutRows.filter((r) => !previous.has(r.id)).map((r) => r.id);

    tx.update(plans)
      .set({
        revision: state.revision,
        notes: plan.notes,
        updatedAt: now,
        dirty: true,
        ...(input ? { input } : {}),
      })
      .where(eq(plans.id, planId))
      .run();
    tx.delete(planWeeks).where(eq(planWeeks.planId, planId)).run();
    tx.delete(planWorkouts).where(eq(planWorkouts.planId, planId)).run();
    tx.delete(planPauses).where(eq(planPauses.planId, planId)).run();
    for (const rows of chunks(weekRows)) tx.insert(planWeeks).values(rows).run();
    for (const rows of chunks(workoutRows)) tx.insert(planWorkouts).values(rows).run();
    for (const rows of chunks(pauseRows)) tx.insert(planPauses).values(rows).run();
    for (const ids of chunks(removed)) {
      tx.insert(syncTombstones)
        .values(ids.map((id) => ({ entity: 'workout' as const, planId, id, deletedAt: now })))
        .onConflictDoUpdate({
          target: [syncTombstones.entity, syncTombstones.planId, syncTombstones.id],
          set: { deletedAt: now },
        })
        .run();
    }
    // A workout that comes back (same id) is no longer deleted.
    for (const ids of chunks(added)) {
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
  notifyLocalChange();
}

export async function deletePlan(): Promise<void> {
  const now = Date.now();
  db.transaction((tx) => removeAllPlans(tx, now));
  notifyLocalChange();
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function insertPlanRow(
  tx: Tx,
  id: string,
  input: StoredPlanInput,
  plan: Plan,
  revision: number,
  now: number,
): void {
  tx.insert(plans)
    .values({
      id,
      input,
      goal: plan.goal,
      startDate: plan.startDate,
      targetDate: plan.targetDate,
      notes: plan.notes,
      revision,
      createdAt: now,
      updatedAt: now,
      dirty: true,
    })
    .run();
}

/** Snapshot of the plan with its outcome on `today` (the archive day). */
function archive(tx: Tx, current: StoredPlan, today: string, now: number): void {
  const { outcome, summary } = planOutcome(current.state, current.input.profile, today);
  const values = {
    id: current.id,
    input: current.input,
    goal: current.state.plan.goal,
    startDate: current.state.plan.startDate,
    endDate: summary.endDate,
    archivedAt: now,
    outcome,
    summary,
    review: null,
    state: current.state,
    deleted: false,
    updatedAt: now,
    dirty: true,
  };
  tx.insert(planArchive)
    .values(values)
    .onConflictDoUpdate({ target: planArchive.id, set: values })
    .run();
}

/** Deletes the local plan(s) and leaves a tombstone so the deletion reaches the server. */
function removeAllPlans(tx: Tx, now: number): void {
  for (const old of tx.select({ id: plans.id }).from(plans).all()) {
    tx.insert(syncTombstones)
      .values({ entity: 'plan', planId: old.id, id: old.id, deletedAt: now })
      .onConflictDoUpdate({
        target: [syncTombstones.entity, syncTombstones.planId, syncTombstones.id],
        set: { deletedAt: now },
      })
      .run();
  }
  // Workout tombstones of a deleted plan are covered by the plan's tombstone.
  tx.delete(syncTombstones).where(eq(syncTombstones.entity, 'workout')).run();
  tx.delete(planWorkouts).run();
  tx.delete(planWeeks).run();
  tx.delete(planPauses).run();
  tx.delete(plans).run();
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
