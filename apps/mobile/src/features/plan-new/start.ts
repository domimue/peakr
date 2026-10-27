import { prepareAnswers, QUESTION_IDS, setAnswer, type QuizAnswers } from '@peakr/quiz';

import { clearBaseline } from '@/data/repositories/baseline-repository';
import { useBaselineStore } from '@/features/baseline/baseline-store';
import { localToday, useQuizStore } from '@/features/onboarding/quiz-store';

import type { PreviousPlan } from './calibrate';
import { useNewPlanFlow } from './flow-store';

const MIN_RACE_DAYS = 14;

/**
 * The quiz answers for the next plan: the earlier answers, with the availability as it is now in
 * the plan (Profile edits included) and without a race date that has passed or is too close.
 */
export function prefilledAnswers(
  given: QuizAnswers,
  current: PreviousPlan | null,
  today: string,
): QuizAnswers {
  let answers = given;
  if (current) {
    const { availability } = current.input;
    answers = setAnswer(answers, QUESTION_IDS.availability, [...availability.minutesPerDay]);
    answers = setAnswer(answers, QUESTION_IDS.doubles, availability.doublesAllowed ? 'yes' : 'no');
  }
  const target = prepareAnswers(answers, today)[QUESTION_IDS.targetDate];
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + MIN_RACE_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (typeof target === 'string' && target < soon) {
    const { [QUESTION_IDS.targetDate]: _gone, ...rest } = answers;
    answers = rest;
  }
  return answers;
}

/**
 * Starts "Create a new plan": the quiz opens at its first step with the earlier answers, and the
 * Strava baseline is read again (a new plan is always calibrated on the last two months).
 */
export async function startNewPlan(current: PreviousPlan | null): Promise<void> {
  const quiz = useQuizStore.getState();
  await quiz.hydrate();
  const answers = prefilledAnswers(useQuizStore.getState().answers, current, localToday());
  useQuizStore.setState({ answers, stepId: null, insight: false, finished: false, direction: 1 });
  // `goTo` saves the whole progress, the prefilled answers included.
  useQuizStore.getState().goTo('goal', false, 1);
  await clearBaseline();
  await useBaselineStore.getState().hydrate();
  useNewPlanFlow.getState().start();
}
