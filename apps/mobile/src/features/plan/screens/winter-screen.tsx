import { planConfig, type UserProfile } from '@peakr/engine';
import {
  onboardingQuestions,
  QUESTION_IDS,
  winterSportsOf,
  type QuizAnswers,
  type QuizQuestion,
} from '@peakr/quiz';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, ChipGroup, Screen, Text, useTheme } from '@/ui';

import { QuestionInput } from '../../onboarding/question-input';
import { formatDate } from '../calendar';
import { usePlan, usePlanActions } from '../queries';
import { issueText } from './plan-screen';

const QUESTION = onboardingQuestions.find(
  (q) => q.id === QUESTION_IDS.winterSports,
) as QuizQuestion;
const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const;
type Month = (typeof MONTHS)[number];

/**
 * Winter sports and the winter period (CLAUDE.md "Winter sports"): inside the period easy and long
 * sessions offer a winter variant of equivalent load. Saving rebuilds the remaining weeks.
 */
export function WinterScreen() {
  const { data: stored } = usePlan();
  if (!stored) return <Screen />;
  return <WinterForm profile={stored.input.profile} />;
}

function WinterForm({ profile }: { profile: UserProfile }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const actions = usePlanActions();
  const [answers, setAnswers] = useState<QuizAnswers>({
    [QUESTION.id]: [...(profile.winterSports ?? [])],
  });
  const [months, setMonths] = useState<Month[]>(
    (profile.winterMonths ?? planConfig.winter.defaultMonths).map((m) => String(m) as Month),
  );
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const winterSports = winterSportsOf(answers);
    const next: UserProfile = { ...profile, winterMonths: months.map(Number) };
    if (winterSports.length > 0) next.winterSports = winterSports;
    else delete next.winterSports;
    const result = actions.updateProfile(next);
    if (!result.ok) setError(issueText(t, result.issues));
    else router.back();
  };

  return (
    <Screen>
      <Text tone="secondary">{t('plan.winter.hint')}</Text>
      <QuestionInput
        question={QUESTION}
        answers={answers}
        issues={[]}
        onAnswer={(value) => setAnswers({ [QUESTION.id]: value })}
        onClear={() => setAnswers({})}
      />
      <ChipGroup
        multiple
        label={t('plan.winter.monthsTitle')}
        options={MONTHS.map((m) => ({
          value: m,
          label: formatDate(`2026-${m.padStart(2, '0')}-01`, i18n.language, { month: 'short' }),
        }))}
        selected={months}
        onToggle={(m) =>
          setMonths((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]))
        }
      />
      {error ? <Text style={{ color: colors.errorText }}>{error}</Text> : null}
      <Button label={t('plan.winter.save')} disabled={months.length === 0} onPress={save} />
    </Screen>
  );
}
