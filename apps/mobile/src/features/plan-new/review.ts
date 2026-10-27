import {
  planReview,
  reviewAdjustments,
  type LinkedActivityFacts,
  type PlanReview,
  type ReviewChanges,
} from '@peakr/engine';
import { useMemo } from 'react';

import { localToday } from '@/features/onboarding/quiz-store';
import { useLinkedActivities } from '@/features/activities/queries';
import { planTargetBands } from '@/features/training-zones/resolve';

import { useNewPlanFlow } from './flow-store';
import { usePreviousPlan } from './previous';

/** The review of the previous plan and what the given answers change (null without a plan). */
export function usePlanReview(): { measured: PlanReview; changes: ReviewChanges } | null {
  const { previous } = usePreviousPlan();
  const answers = useNewPlanFlow((s) => s.review);
  const { data: linked } = useLinkedActivities();
  return useMemo(() => {
    if (!previous) return null;
    const today = localToday();
    const facts: LinkedActivityFacts[] = [...(linked ?? [])].map(([workoutId, { activity }]) => ({
      workoutId,
      durationSec: activity.durationSec,
      distanceM: activity.distanceM,
      avgHr: activity.avgHr,
    }));
    const easyTop = planTargetBands(previous.input).find((b) => b.zone === 2)?.maxBpm ?? undefined;
    const measured = planReview(previous.state, previous.input.profile, today, facts, easyTop);
    return { measured, changes: reviewAdjustments(measured, answers, previous.input.profile) };
  }, [previous, answers, linked]);
}
