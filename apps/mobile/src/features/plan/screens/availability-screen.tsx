import type { Availability, GoalKind, Sport, UserProfile } from '@peakr/engine';
import {
  onboardingQuestions,
  prepareAnswers,
  QUESTION_IDS,
  sessionsOf,
  setAnswer,
  validateAnswers,
  visibleQuestions,
  type QuizAnswers,
} from '@peakr/quiz';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { todayIso } from '@/data/ids';
import { Button, Card, Screen, Text, useTheme } from '@/ui';

import { QuestionInput } from '../../onboarding/question-input';
import { usePlan, usePlanActions } from '../queries';
import { issueText } from '../issue-text';

const Q = QUESTION_IDS;
const IDS: readonly string[] = [
  Q.sessionsMode,
  Q.runSessions,
  Q.bikeSessions,
  Q.swimSessions,
  Q.availability,
  Q.doubles,
];
const QUESTIONS = onboardingQuestions.filter((q) => IDS.includes(q.id));
const SESSION_IDS: Record<Sport, string> = {
  run: Q.runSessions,
  bike: Q.bikeSessions,
  swim: Q.swimSessions,
};

/**
 * Profile of the week as in the quiz (same shared questions): sessions per discipline (Peakr's
 * suggestion or the user's own numbers), then the minutes per day. Saving rebuilds the remaining
 * weeks from today; everything before today and every completed workout stays.
 */
export function AvailabilityScreen() {
  const { data: stored } = usePlan();
  if (!stored) return <Screen />;
  return (
    <AvailabilityForm
      availability={stored.input.availability}
      profile={stored.input.profile}
      goal={stored.input.goal.kind}
    />
  );
}

function AvailabilityForm({
  availability,
  profile,
  goal,
}: {
  availability: Availability;
  profile: UserProfile;
  goal: GoalKind;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const actions = usePlanActions();
  const [answers, setAnswers] = useState<QuizAnswers>(() => {
    const own = profile.sessionsPerWeek;
    return prepareAnswers(
      {
        [Q.goal]: goal,
        [Q.sports]: [...profile.sports],
        [Q.experience]: profile.experience,
        [Q.sessionsMode]: own ? 'own' : 'suggest',
        ...Object.fromEntries(
          profile.sports.flatMap((s) => (own?.[s] ? [[SESSION_IDS[s], own[s]]] : [])),
        ),
        [Q.availability]: [...availability.minutesPerDay],
        [Q.doubles]: availability.doublesAllowed ? 'yes' : 'no',
      },
      todayIso(),
    );
  });
  const [error, setError] = useState<string | null>(null);
  const questions = visibleQuestions(QUESTIONS, answers);
  const issues = validateAnswers(questions, answers, { raceGoal: false });

  const save = () => {
    if (issues.length > 0) return;
    const minutes = answers[Q.availability] as readonly number[];
    const result = actions.updateAvailability(
      {
        minutesPerDay: minutes.slice(0, 7) as unknown as Availability['minutesPerDay'],
        doublesAllowed: answers[Q.doubles] === 'yes',
      },
      sessionsOf(answers) ?? null,
    );
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
          onAnswer={(value) =>
            setAnswers((a) => prepareAnswers(setAnswer(a, q.id, value), todayIso()))
          }
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
