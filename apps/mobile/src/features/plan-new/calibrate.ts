import { historyBaseline, withHistoryBaseline, type PlanState } from '@peakr/engine';
import { toPlanInput, type QuizAnswers } from '@peakr/quiz';

import type { StoredPlanInput } from '@/data/db/schema';
import { calibrateOnboarding } from '@/features/baseline/calibration';
import type { BaselineMeta, StoredBaselineActivity } from '@/data/repositories/baseline-repository';

/**
 * The plan the next one follows: the active plan, or – once it ended and was archived – the most
 * recent archived one.
 */
export interface PreviousPlan {
  state: PlanState;
  input: StoredPlanInput;
}

/**
 * The input of the new plan: the quiz answers, calibrated with the fresh Strava baseline, and the
 * sessions of the previous plan as the primary source of the start values (the higher value per
 * sport wins, so it never starts below what the user really did).
 */
export function newPlanInput(
  answers: QuizAnswers,
  baseline: { activities: readonly StoredBaselineActivity[]; meta: BaselineMeta | null },
  current: PreviousPlan | null,
  today: string,
) {
  const input = toPlanInput(answers, today);
  if (!input.ok) return null;
  const calibrated = calibrateOnboarding(input.value, baseline, today);
  if (!current) return calibrated;
  const history = historyBaseline(current.state, current.input.profile, today);
  // Settings made in Profile after the first quiz stay what the user set.
  const kept = current.input.profile;
  const profile = withHistoryBaseline(
    {
      ...calibrated.profile,
      ...(kept.difficulty !== undefined ? { difficulty: kept.difficulty } : {}),
      ...(kept.benchmarks !== undefined ? { benchmarks: kept.benchmarks } : {}),
      ...(kept.winterMonths ? { winterMonths: kept.winterMonths } : {}),
      ...(kept.commutes ? { commutes: kept.commutes } : {}),
    },
    history,
  );
  return { ...calibrated, profile };
}
