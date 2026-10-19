import type { Plan, PlanState, Workout, WorkoutStatus } from '@peakr/engine';
import { asc, eq } from 'drizzle-orm';

import { db } from '../db/client';
import { planPauses, plans, planWeeks, planWorkouts, type StoredPlanInput } from '../db/schema';
import { newId } from '../ids';

/**
 * The local training plan: one active plan with its weeks, workouts (incl. done / skipped) and
 * pauses. The engine edits a `PlanState` in memory; `savePlanState` writes the result back in one
 * transaction. Screens use it through `features/plan/queries.ts`; tests use `__mocks__`.
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
      plan: value,
      status,
      revision: plan.revision,
      pauses: pauses.map(({ reason, startDate, endDate }) => ({ reason, startDate, endDate })),
    },
  };
}

/** Replaces any existing plan (a new quiz result starts a new plan). */
export async function createPlan(input: StoredPlanInput, plan: Plan): Promise<string> {
  const id = newId();
  const now = Date.now();
  db.transaction((tx) => {
    tx.delete(planWorkouts).run();
    tx.delete(planWeeks).run();
    tx.delete(planPauses).run();
    tx.delete(plans).run();
    tx.insert(plans)
      .values({
        id,
        input,
        goal: plan.goal,
        startDate: plan.startDate,
        targetDate: plan.targetDate,
        notes: plan.notes,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  await savePlanState(id, { plan, status: {}, pauses: [], revision: 0 });
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
  const workoutRows = plan.weeks.flatMap((w) =>
    w.workouts.map((x) => ({
      planId,
      id: x.id,
      date: x.date,
      status: state.status[x.id] ?? ('planned' as const),
      data: x,
    })),
  );
  const pauseRows = state.pauses.map((p) => ({ id: newId(), planId, ...p }));
  db.transaction((tx) => {
    tx.update(plans)
      .set({
        revision: state.revision,
        notes: plan.notes,
        updatedAt: Date.now(),
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
  });
}

export async function deletePlan(): Promise<void> {
  db.transaction((tx) => {
    tx.delete(planWorkouts).run();
    tx.delete(planWeeks).run();
    tx.delete(planPauses).run();
    tx.delete(plans).run();
  });
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
