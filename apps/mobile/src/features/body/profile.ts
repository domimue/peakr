import {
  trendWeightKg,
  validateBodyProfile,
  type BodyProfile,
  type BodyProfileField,
} from '@peakr/engine';
import { QUESTION_IDS, type QuizAnswers } from '@peakr/quiz';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { todayIso } from '@/data/ids';
import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { useEntitlement } from '@/features/billing/billing-store';

const body = () => import('@/data/repositories/body-repository');
const onboarding = () => import('@/data/repositories/onboarding-repository');

/**
 * The shared profile values the add-on needs (sex, birth date, height, weight). They live in the
 * one Peakr profile (`profiles` on the account, the same values on the device); the quiz answers
 * fill what is not there yet, and the add-on asks for the rest inline – never a second form.
 * The weight used for calculations is the smoothed trend of the check-ins once there are any.
 */

export interface BodyProfileState {
  values: Partial<BodyProfile>;
  /** Values still missing (or out of range): asked inline when the add-on opens. */
  missing: BodyProfileField[];
  /** Complete and valid; null while something is missing. */
  profile: BodyProfile | null;
}

export const bodyProfileKey = ['body', 'profile'] as const;

function fromQuiz(answers: QuizAnswers | undefined): Partial<BodyProfile> {
  if (!answers) return {};
  const sex = answers[QUESTION_IDS.sex];
  const height = answers[QUESTION_IDS.heightCm];
  const weight = answers[QUESTION_IDS.weightKg];
  return {
    ...(sex === 'female' || sex === 'male' ? { sex } : {}),
    ...(typeof height === 'number' ? { heightCm: height } : {}),
    ...(typeof weight === 'number' ? { weightKg: weight } : {}),
  };
}

export function mergeProfile(
  layers: readonly Partial<BodyProfile>[],
  trendKg: number | null,
  today: string,
): BodyProfileState {
  // Later layers fill gaps only: stored profile > account > quiz.
  const values: Partial<BodyProfile> = {};
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer) as [keyof BodyProfile, never][]) {
      if (values[k] === undefined && v !== undefined && v !== null) values[k] = v;
    }
  }
  if (trendKg !== null) values.weightKg = trendKg;
  const result = validateBodyProfile(values, today);
  return result.ok
    ? { values, missing: [], profile: result.value }
    : { values, missing: [...new Set(result.issues.map((i) => i.field))], profile: null };
}

/** Only read where the add-on shows real data (the guard's `canRead`). */
export function useBodyProfile() {
  const userId = useSessionStore(selectAccountUserId);
  const guard = useEntitlement('body_nutrition');
  return useQuery({
    queryKey: [...bodyProfileKey, userId],
    enabled: guard.canRead,
    queryFn: async (): Promise<BodyProfileState> => {
      const repo = await body();
      const stored = await repo.getProfile();
      const remote = await repo.fetchRemoteProfile(userId).catch(() => ({}));
      const progress = await (await onboarding()).getQuizProgress().catch(() => null);
      const quiz = fromQuiz(progress?.answers);
      const trend = trendWeightKg(
        (await repo.listCheckIns()).map((c) => ({ date: c.day, weightKg: c.weightKg })),
      );
      return mergeProfile([stored, remote, quiz], trend, todayIso());
    },
  });
}

export function useSaveBodyProfile() {
  const client = useQueryClient();
  const userId = useSessionStore(selectAccountUserId);
  return useMutation({
    mutationFn: async (values: Partial<BodyProfile>) => (await body()).saveProfile(values, userId),
    onSuccess: () => client.invalidateQueries({ queryKey: bodyProfileKey }),
  });
}
