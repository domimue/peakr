import { planEnded, planOutcome, type Plan, type PlanState } from '@peakr/engine';

import type { StoredPlanInput } from '../../db/schema';
import type { ArchivedPlan } from '../plan-archive-repository';
import type { StoredPlan } from '../plan-repository';

/** In-memory plan repository for Jest (`jest.mock('@/data/repositories/plan-repository')`). */

export type { ArchivedPlan, StoredPlan } from '../plan-repository';

export const store = {
  plan: null as StoredPlan | null,
  /** Archived plans, newest first (shared with the plan-archive-repository mock). */
  archive: [] as ArchivedPlan[],
  next: 1,
};

export function resetStore(): void {
  store.plan = null;
  store.archive = [];
  store.next = 1;
}

function archiveCurrent(today: string): void {
  const current = store.plan;
  if (!current) return;
  const { outcome, summary } = planOutcome(current.state, current.input.profile, today);
  store.archive.unshift({
    id: current.id,
    input: current.input,
    goal: current.state.plan.goal,
    startDate: current.state.plan.startDate,
    endDate: summary.endDate,
    archivedAt: Date.parse(`${today}T12:00:00Z`),
    outcome,
    summary,
    review: null,
    state: current.state,
  });
}

export const getPlan = jest.fn(async () => store.plan);
export const createPlan = jest.fn(
  async (input: StoredPlanInput, plan: Plan, today = '2026-10-27') => {
    archiveCurrent(today);
    const id = `plan-${store.next++}`;
    store.plan = { id, input, state: { plan, status: {}, pauses: [], revision: 0 } };
    return id;
  },
);
export const savePlanState = jest.fn(
  async (planId: string, state: PlanState, input?: StoredPlanInput) => {
    if (store.plan?.id !== planId) throw new Error(`unknown plan ${planId}`);
    store.plan = { ...store.plan, state, input: input ?? store.plan.input };
  },
);
export const deletePlan = jest.fn(async () => {
  store.plan = null;
});
export const archiveEndedPlan = jest.fn(async (today = '2026-10-27') => {
  const current = store.plan;
  if (!current || !planEnded(current.state, today)) return null;
  archiveCurrent(today);
  store.plan = null;
  return current.id;
});
/** In the mock every archive happened "today". */
export const undoablePlan = jest.fn(async () =>
  store.archive[0] ? { id: store.archive[0].id } : null,
);
export const undoNewPlan = jest.fn(async () => {
  const [restored, ...rest] = store.archive;
  if (!restored) return null;
  store.archive = rest;
  const id = `plan-${store.next++}`;
  store.plan = { id, input: restored.input, state: restored.state };
  return id;
});
export const listArchivedPlans = jest.fn(async () => [...store.archive]);
export const getArchivedPlan = jest.fn(
  async (id: string) => store.archive.find((a) => a.id === id) ?? null,
);
export const saveArchiveReview = jest.fn(async (id: string, review: Record<string, unknown>) => {
  store.archive = store.archive.map((a) => (a.id === id ? { ...a, review } : a));
});
