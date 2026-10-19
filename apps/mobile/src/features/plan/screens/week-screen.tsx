import { planConfig, weekOverrideOf, type WeekMinutes } from '@peakr/engine';
import { validateAnswers, type QuizAnswers, type WeekMinutesQuestion } from '@peakr/quiz';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { StoredPlanInput } from '@/data/db/schema';
import { todayIso } from '@/data/ids';
import { Button, Card, CheckList, Screen, Text, useTheme } from '@/ui';

import { QuestionInput } from '../../onboarding/question-input';
import { addDays, formatDate, mondayOf, weekDates } from '../calendar';
import { usePlan, usePlanActions } from '../queries';
import { issueText } from './plan-screen';

const MINUTES: WeekMinutesQuestion = {
  id: 'week.minutes',
  kind: 'weekMinutes',
  titleKey: 'plan.week.minutesTitle',
  range: { min: 0, max: planConfig.plan.maxMinutesPerDay, step: 15 },
};

/**
 * "This week is different" (CLAUDE.md "Irregular weeks & travel"): other minutes per day and days
 * away for one week. Only that week is rebuilt; "Reset week" goes back to the normal week.
 */
export function WeekScreen({ start }: { start?: string }) {
  const { data: stored } = usePlan();
  if (!stored) return <Screen />;
  const monday = mondayOf(start ?? todayIso());
  return <WeekForm key={monday} monday={monday} input={stored.input} />;
}

function WeekForm({ monday, input }: { monday: string; input: StoredPlanInput }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const actions = usePlanActions();
  const existing = weekOverrideOf(input, monday);
  const [answers, setAnswers] = useState<QuizAnswers>({
    [MINUTES.id]: [...(existing?.minutesPerDay ?? input.availability.minutesPerDay)],
  });
  const [away, setAway] = useState<string[]>([...(existing?.blockedDates ?? [])]);
  const [error, setError] = useState<string | null>(null);
  const issues = validateAnswers([MINUTES], answers);
  const date = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    formatDate(iso, i18n.language, opts);

  const done = (result: ReturnType<typeof actions.setWeekOverride>) => {
    if (!result.ok) setError(issueText(t, result.issues));
    else router.back();
  };

  const save = () => {
    if (issues.length > 0) return;
    const minutesPerDay = (answers[MINUTES.id] as readonly number[]).slice(
      0,
      7,
    ) as unknown as WeekMinutes;
    done(actions.setWeekOverride(monday, { minutesPerDay, blockedDates: away }));
  };

  return (
    <Screen>
      <Text variant="heading" accessibilityRole="header">
        {`${date(monday, { day: 'numeric', month: 'short' })} – ${date(addDays(monday, 6), { day: 'numeric', month: 'short' })}`}
      </Text>
      <Text tone="secondary">{t('plan.week.hint')}</Text>
      <QuestionInput
        question={MINUTES}
        answers={answers}
        issues={issues}
        onAnswer={(value) => setAnswers({ [MINUTES.id]: value })}
        onClear={() => undefined}
      />
      <Text variant="heading" accessibilityRole="header">
        {t('plan.week.awayTitle')}
      </Text>
      <CheckList
        label={t('plan.week.awayTitle')}
        choices={weekDates(monday).map((d) => ({
          value: d,
          label: date(d, { weekday: 'long', day: 'numeric', month: 'short' }),
        }))}
        selected={away}
        onToggle={(d) =>
          setAway((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]))
        }
      />
      {error ? (
        <Card>
          <Text style={{ color: colors.errorText }}>{error}</Text>
        </Card>
      ) : null}
      <Button label={t('plan.week.save')} disabled={issues.length > 0} onPress={save} />
      {existing ? (
        <>
          <Button
            variant="secondary"
            icon="undo"
            label={t('plan.week.reset')}
            onPress={() => done(actions.setWeekOverride(monday, null))}
          />
          <Text variant="caption" tone="secondary">
            {t('plan.week.resetHint')}
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
