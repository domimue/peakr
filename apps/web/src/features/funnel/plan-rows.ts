import { randomUUID } from 'node:crypto';

import type { FunnelPlan } from './plan';

/**
 * The website's plan as the rows the app syncs (tables `plans` and `workouts`, see
 * apps/mobile/src/data/sync): the plan with its weeks as JSON, one row per workout. On the first
 * app login the sync adopts it, so the plan is already there (CLAUDE.md "Web funnel flow" step 6).
 */

export function planRows(userId: string, { input, plan }: FunnelPlan, now = new Date()) {
  const id = randomUUID();
  const stamp = now.toISOString();
  return {
    plan: {
      user_id: userId,
      id,
      // `StoredPlanInput` in the app: the `generatePlan` input plus the heart-rate zone input.
      input: {
        profile: input.profile,
        goal: input.goal,
        availability: input.availability,
        ...(input.targetDate ? { targetDate: input.targetDate } : {}),
        hrZones: input.hrZones,
      },
      goal: plan.goal,
      start_date: plan.startDate,
      target_date: plan.targetDate,
      notes: plan.notes,
      weeks: plan.weeks.map((w) => ({
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
      })),
      pauses: [],
      revision: 0,
      deleted: false,
      created_at: stamp,
      updated_at: stamp,
    },
    workouts: plan.weeks.flatMap((w) =>
      w.workouts.map((workout) => ({
        user_id: userId,
        plan_id: id,
        id: workout.id,
        date: workout.date,
        status: 'planned' as const,
        data: workout,
        deleted: false,
        updated_at: stamp,
      })),
    ),
  };
}
