import type { Plan, PlanState } from '@peakr/engine';

import type { StoredPlanInput } from '../../db/schema';
import type { StoredPlan } from '../plan-repository';

/** In-memory plan repository for Jest (`jest.mock('@/data/repositories/plan-repository')`). */

export type { StoredPlan } from '../plan-repository';

export const store = { plan: null as StoredPlan | null };

export function resetStore(): void {
  store.plan = null;
}

export const getPlan = jest.fn(async () => store.plan);
export const createPlan = jest.fn(async (input: StoredPlanInput, plan: Plan) => {
  store.plan = { id: 'plan-1', input, state: { plan, status: {}, pauses: [], revision: 0 } };
  return 'plan-1';
});
export const savePlanState = jest.fn(
  async (planId: string, state: PlanState, input?: StoredPlanInput) => {
    if (store.plan?.id !== planId) throw new Error(`unknown plan ${planId}`);
    store.plan = { ...store.plan, state, input: input ?? store.plan.input };
  },
);
export const deletePlan = jest.fn(async () => {
  store.plan = null;
});
