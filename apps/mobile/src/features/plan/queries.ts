import {
  easeWorkout,
  generatePlan,
  moveWorkout,
  pausePlan,
  regeneratePlan,
  resumePlan,
  setWorkoutStatus,
  type Availability,
  type MoveResult,
  type PauseReason,
  type PlanState,
  type EditResult,
  type WorkoutStatus,
} from '@peakr/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { StoredPlanInput } from '@/data/db/schema';
import { todayIso } from '@/data/ids';
import * as repo from '@/data/repositories/plan-repository';

/** TanStack Query hooks over the local plan repository plus the engine edits on top of it. */

export const planKeys = { plan: ['plan'] as const };

export function usePlan() {
  return useQuery({ queryKey: planKeys.plan, queryFn: repo.getPlan });
}

/** Generates the plan from the onboarding result and stores it (replaces an existing plan). */
export function useCreatePlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: StoredPlanInput & { startDate: string }) => {
      const { startDate, ...stored } = input;
      const plan = generatePlan(
        stored.profile,
        stored.goal,
        stored.availability,
        startDate,
        stored.targetDate,
      );
      if (!plan.ok) throw new Error(plan.issues.map((i) => `${i.field}: ${i.code}`).join(', '));
      await repo.createPlan(stored, plan.value);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: planKeys.plan }),
  });
}

type Edit = EditResult<PlanState>;

interface SaveArgs {
  planId: string;
  state: PlanState;
  input?: StoredPlanInput;
}

/**
 * Plan edits: each runs the pure engine function on the current state and, if it succeeds, saves
 * the new state (optimistically, so the calendar updates at once). Returns the engine result so
 * the screen can show issues and move warnings.
 */
export function usePlanActions() {
  const client = useQueryClient();
  const { data: stored } = usePlan();
  const save = useMutation({
    mutationFn: ({ planId, state, input }: SaveArgs) => repo.savePlanState(planId, state, input),
    onMutate: ({ state, input }) => {
      if (!stored) return;
      client.setQueryData<repo.StoredPlan>(planKeys.plan, {
        ...stored,
        state,
        input: input ?? stored.input,
      });
    },
    onSettled: () => client.invalidateQueries({ queryKey: planKeys.plan }),
  });

  function commit(result: Edit, input?: StoredPlanInput): Edit {
    if (result.ok && stored) save.mutate({ planId: stored.id, state: result.value, input });
    return result;
  }

  const today = todayIso();
  // Only reachable before the plan has loaded.
  const missing = {
    ok: false as const,
    issues: [{ field: 'workout' as const, code: 'notFound' as const }],
  };

  return {
    ready: stored !== undefined && stored !== null,
    move(id: string, toDate: string): EditResult<MoveResult> {
      if (!stored) return missing;
      const result = moveWorkout(stored.state, id, toDate, stored.input, today);
      if (result.ok) commit({ ok: true, value: result.value.state });
      return result;
    },
    /** Applies the engine's rebalance suggestion of the last move. */
    apply(state: PlanState): Edit {
      return commit({ ok: true, value: state });
    },
    /** "Make the other day easier" – several sessions in one save. */
    ease(ids: readonly string[]): Edit {
      if (!stored) return missing;
      let result: Edit = { ok: true, value: stored.state };
      for (const id of ids) {
        if (!result.ok) break;
        result = easeWorkout(result.value, id, stored.input);
      }
      return commit(result);
    },
    setStatus(id: string, status: WorkoutStatus): Edit {
      if (!stored) return missing;
      return commit(setWorkoutStatus(stored.state, id, status));
    },
    pause(reason: PauseReason, startDate: string): Edit {
      if (!stored) return missing;
      return commit(pausePlan(stored.state, reason, startDate, today));
    },
    resume(): Edit {
      if (!stored) return missing;
      return commit(resumePlan(stored.state, today, stored.input, today));
    },
    /** New availability: the remaining weeks are generated again. */
    updateAvailability(availability: Availability): Edit {
      if (!stored) return missing;
      const input = { ...stored.input, availability };
      return commit(regeneratePlan(stored.state, input, today), input);
    },
  };
}
