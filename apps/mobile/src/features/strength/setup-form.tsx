import {
  toStrengthSetup,
  validateAnswers,
  visibleQuestions,
  withDefaults,
  strengthQuestions,
  type QuizAnswers,
  type QuizContext,
  type QuizQuestion,
} from '@peakr/quiz';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { StoredStrengthSetup } from '@/data/repositories/strength-repository';
import { Button, ChoiceList, Stepper, spacing, Text } from '@/ui';

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
  onAnswer: (value: string | number) => void;
}) {
  const { t } = useTranslation();
  const title = t(question.titleKey as never) as string;
  const hint = question.hintKey ? (t(question.hintKey as never) as string) : undefined;
  return (
    <View style={styles.question}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {hint ? <Text tone="secondary">{hint}</Text> : null}
      {question.kind === 'single' ? (
        <ChoiceList
          label={title}
          value={answers[question.id] as string | undefined}
          onChange={onAnswer}
          choices={question.options.map((o) => ({
            value: o.value,
            label: t(o.labelKey as never) as string,
            description: o.descriptionKey ? (t(o.descriptionKey as never) as string) : undefined,
          }))}
        />
      ) : (
        <NumberQuestion question={question} answers={answers} onAnswer={onAnswer} label={title} />
      )}
    </View>
  );
}

function NumberQuestion({
  question,
  answers,
  onAnswer,
  label,
}: {
  question: Extract<QuizQuestion, { kind: 'number' }>;
  answers: QuizAnswers;
  onAnswer: (value: number) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const range = question.range(answers);
  const raw = answers[question.id];
  const value = typeof raw === 'number' ? raw : range.min;
  return (
    <Stepper
      label={label}
      value={value}
      min={range.min}
      max={range.max}
      onChange={onAnswer}
      format={(n) =>
        question.unitKey ? (t(question.unitKey as never, { count: n }) as string) : String(n)
      }
      decreaseLabel={t('common.decrease')}
      increaseLabel={t('common.increase')}
    />
  );
}

/** Keeps e.g. the days per week inside a newly picked split's range. */
function clampNumbers(answers: QuizAnswers): QuizAnswers {
  const out: Record<string, string | number> = { ...answers } as Record<string, string | number>;
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
  const answer = (id: string, value: string | number) => setGiven({ ...answers, [id]: value });
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

const styles = StyleSheet.create({
  question: { gap: spacing.sm },
});
