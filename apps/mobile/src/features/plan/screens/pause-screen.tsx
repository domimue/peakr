import { activePause, resumeRules, type PauseReason } from '@peakr/engine';
import type { DateQuestion } from '@peakr/quiz';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { daysBetween, todayIso } from '@/data/ids';
import { Button, Card, ChoiceList, Screen, Text, useTheme } from '@/ui';

import { QuestionInput } from '../../onboarding/question-input';
import { formatDate } from '../calendar';
import { usePlan, usePlanActions } from '../queries';
import { issueText } from './plan-screen';

const REASONS: PauseReason[] = ['illness', 'injury', 'holiday'];

const START_QUESTION: DateQuestion = {
  id: 'pause.start',
  kind: 'date',
  titleKey: 'plan.pause.startTitle',
  rangeDays: { min: 0, max: 90 },
};

/**
 * Pause the plan (illness, injury, holiday) or resume it. Resuming rebuilds the rest of the plan
 * with a lighter first week (CLAUDE.md "Pause": ≤ 7 days 80 %, ≤ 14 days 70 %, longer 60 % + Base).
 */
export function PauseScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { data: stored } = usePlan();
  const actions = usePlanActions();
  const today = todayIso();
  const [reason, setReason] = useState<PauseReason | undefined>(undefined);
  const [start, setStart] = useState(today);
  const [error, setError] = useState<string | null>(null);

  if (!stored) return <Screen />;
  const pause = activePause(stored.state);
  const done = (result: ReturnType<typeof actions.resume>) => {
    if (!result.ok) setError(issueText(t, result.issues));
    else router.back();
  };

  if (pause) {
    const days = Math.max(0, daysBetween(pause.startDate, today));
    const rules = resumeRules(days);
    return (
      <Screen>
        <Card>
          <Text>
            {t('plan.pause.running', {
              date: formatDate(pause.startDate, i18n.language, { day: 'numeric', month: 'long' }),
              reason: t(`plan.pause.reasons.${pause.reason}`),
              count: days,
            })}
          </Text>
          <Text tone="secondary">
            {days === 0
              ? t('plan.pause.resumeNoChange')
              : rules.restartPhases
                ? t('plan.pause.resumeBase', { percent: Math.round(rules.factor * 100) })
                : t('plan.pause.resumeInfo', { percent: Math.round(rules.factor * 100) })}
          </Text>
        </Card>
        {error ? <Text style={{ color: colors.errorText }}>{error}</Text> : null}
        <Button label={t('plan.pause.resume')} onPress={() => done(actions.resume())} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="heading" accessibilityRole="header">
        {t('plan.pause.reasonTitle')}
      </Text>
      <ChoiceList
        label={t('plan.pause.reasonTitle')}
        choices={REASONS.map((r) => ({ value: r, label: t(`plan.pause.reasons.${r}`) }))}
        value={reason}
        onChange={setReason}
      />
      <QuestionInput
        question={START_QUESTION}
        answers={{ [START_QUESTION.id]: start }}
        issues={[]}
        onAnswer={(value) => setStart(String(value))}
        onClear={() => setStart(today)}
      />
      <Text tone="secondary">{t('plan.pause.rules')}</Text>
      {error ? <Text style={{ color: colors.errorText }}>{error}</Text> : null}
      <Button
        label={t('plan.pause.start')}
        disabled={reason === undefined}
        onPress={() => reason && done(actions.pause(reason, start))}
      />
    </Screen>
  );
}
