import type { Availability } from '@peakr/engine';
import {
  onboardingQuestions,
  QUESTION_IDS,
  setAnswer,
  validateAnswers,
  visibleQuestions,
  type QuizAnswers,
} from '@peakr/quiz';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Card, Screen, Text, useTheme } from '@/ui';

import { QuestionInput } from '../../onboarding/question-input';
import { usePlan, usePlanActions } from '../queries';
import { issueText } from '../issue-text';

const Q = QUESTION_IDS;
const QUESTIONS = onboardingQuestions.filter((q) => q.id === Q.availability || q.id === Q.doubles);

/**
 * Profile of the week as in the quiz (same shared questions). Saving rebuilds the remaining weeks
 * from today; everything before today and every completed workout stays.
 */
export function AvailabilityScreen() {
  const { data: stored } = usePlan();
  if (!stored) return <Screen />;
  return (
    <AvailabilityForm
      availability={stored.input.availability}
      sports={stored.input.profile.sports}
    />
  );
}

function AvailabilityForm({
  availability,
  sports,
}: {
  availability: Availability;
  sports: readonly string[];
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const actions = usePlanActions();
  const [answers, setAnswers] = useState<QuizAnswers>({
    [Q.sports]: [...sports],
    [Q.availability]: [...availability.minutesPerDay],
    [Q.doubles]: availability.doublesAllowed ? 'yes' : 'no',
  });
  const [error, setError] = useState<string | null>(null);
  const questions = visibleQuestions(QUESTIONS, answers);
  const issues = validateAnswers(questions, answers, { raceGoal: false });

  const save = () => {
    if (issues.length > 0) return;
    const minutes = answers[Q.availability] as readonly number[];
    const result = actions.updateAvailability({
      minutesPerDay: minutes.slice(0, 7) as unknown as Availability['minutesPerDay'],
      doublesAllowed: answers[Q.doubles] === 'yes',
    });
    if (!result.ok) {
      setError(issueText(t, result.issues));
      return;
    }
    router.back();
  };

  return (
    <Screen>
      <Text tone="secondary">{t('plan.availability.hint')}</Text>
      {questions.map((q) => (
        <QuestionInput
          key={q.id}
          question={q}
          answers={answers}
          issues={issues.filter((i) => i.questionId === q.id)}
          onAnswer={(value) => setAnswers((a) => setAnswer(a, q.id, value))}
          onClear={() => undefined}
        />
      ))}
      {error ? (
        <Card>
          <Text style={{ color: colors.errorText }}>{error}</Text>
        </Card>
      ) : null}
      <Button label={t('plan.availability.save')} disabled={issues.length > 0} onPress={save} />
    </Screen>
  );
}
