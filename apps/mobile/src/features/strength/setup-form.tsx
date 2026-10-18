import {
  toStrengthSetup,
  validateAnswers,
  visibleQuestions,
  withDefaults,
  strengthQuestions,
  type QuizAnswers,
  type QuizAnswerValue,
  type QuizContext,
  type QuizQuestion,
} from '@peakr/quiz';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { StoredStrengthSetup } from '@/data/repositories/strength-repository';
import { QuestionInput } from '@/features/onboarding/question-input';
import { Button } from '@/ui';

/**
 * The goal question group is not built yet; until it is, defaults assume a non-race goal
 * (strength priority "balanced"). The user can change it in the same step.
 */
export const QUIZ_CONTEXT: QuizContext = { raceGoal: false };

export function setupFromAnswers(answers: QuizAnswers): StoredStrengthSetup {
  // Routines and custom exercises stay in their own tables.
  const { routines: _r, customExercises: _c, ...setup } = toStrengthSetup(answers);
  return setup;
}

export function QuestionView({
  question,
  answers,
  onAnswer,
}: {
  question: QuizQuestion;
  answers: QuizAnswers;
  onAnswer: (value: QuizAnswerValue) => void;
}) {
  // Strength questions always have a value (defaults), so there is nothing to clear.
  return (
    <QuestionInput
      question={question}
      answers={answers}
      issues={[]}
      onAnswer={onAnswer}
      onClear={() => undefined}
    />
  );
}

/** Keeps e.g. the days per week inside a newly picked split's range. */
function clampNumbers(answers: QuizAnswers): QuizAnswers {
  const out: Record<string, QuizAnswerValue> = { ...answers } as Record<string, QuizAnswerValue>;
  for (const q of visibleQuestions(strengthQuestions, answers)) {
    const v = out[q.id];
    if (q.kind !== 'number' || typeof v !== 'number') continue;
    const { min, max } = q.range(answers);
    out[q.id] = Math.min(max, Math.max(min, v));
  }
  return out;
}

/** Answers with defaults; answering a question keeps the later answers that still apply. */
export function useStrengthAnswers(initial: QuizAnswers) {
  const [given, setGiven] = useState<QuizAnswers>(initial);
  const answers = useMemo(
    () => clampNumbers(withDefaults(strengthQuestions, given, QUIZ_CONTEXT)),
    [given],
  );
  const questions = visibleQuestions(strengthQuestions, answers);
  const issues = validateAnswers(strengthQuestions, answers);
  const answer = (id: string, value: QuizAnswerValue) => setGiven({ ...answers, [id]: value });
  return { answers, questions, issues, answer };
}

/** All questions on one page (Profile → Strength). */
export function StrengthSetupForm({
  initial,
  saving,
  onSave,
}: {
  initial: QuizAnswers;
  saving: boolean;
  onSave: (setup: StoredStrengthSetup) => void;
}) {
  const { t } = useTranslation();
  const { answers, questions, issues, answer } = useStrengthAnswers(initial);
  return (
    <>
      {questions.map((q) => (
        <QuestionView key={q.id} question={q} answers={answers} onAnswer={(v) => answer(q.id, v)} />
      ))}
      <Button
        label={t('strength.setup.save')}
        disabled={issues.length > 0 || saving}
        onPress={() => onSave(setupFromAnswers(answers))}
      />
    </>
  );
}
