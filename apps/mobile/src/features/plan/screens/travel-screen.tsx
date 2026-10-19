import { activeTravel } from '@peakr/engine';
import type { DateQuestion } from '@peakr/quiz';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { todayIso } from '@/data/ids';
import { Button, Card, CheckRow, Screen, Text, useTheme } from '@/ui';

import { QuestionInput } from '../../onboarding/question-input';
import { addDays, formatDate } from '../calendar';
import { usePlan, usePlanActions } from '../queries';
import { issueText } from './plan-screen';

const START: DateQuestion = {
  id: 'travel.start',
  kind: 'date',
  titleKey: 'plan.travel.start',
  rangeDays: { min: 0, max: 365 },
};
const END: DateQuestion = { ...START, id: 'travel.end', titleKey: 'plan.travel.end' };

/**
 * Travel mode (CLAUDE.md "Irregular weeks & travel"): dates and what is available at the
 * location. The weeks of the trip are rebuilt; ending it rebuilds them as normal weeks.
 */
export function TravelScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { data: stored } = usePlan();
  const actions = usePlanActions();
  const today = todayIso();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 6));
  const [pool, setPool] = useState(false);
  const [bike, setBike] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!stored) return <Screen />;
  const all = stored.input.availability.travel ?? [];
  const active = activeTravel(stored.input, today);
  const date = (iso: string) =>
    formatDate(iso, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const done = (result: ReturnType<typeof actions.setTravel>) => {
    if (!result.ok) setError(issueText(t, result.issues));
    else router.back();
  };

  if (active) {
    return (
      <Screen>
        <Card>
          <Text>
            {t('plan.travel.active', { from: date(active.startDate), to: date(active.endDate) })}
          </Text>
        </Card>
        <Text tone="secondary">{t('plan.travel.hint')}</Text>
        {error ? <Text style={{ color: colors.errorText }}>{error}</Text> : null}
        <Button
          icon="close"
          label={t('plan.travel.stop')}
          onPress={() => done(actions.setTravel(all.filter((p) => p !== active)))}
        />
      </Screen>
    );
  }

  const invalid = end < start;
  return (
    <Screen>
      <Text tone="secondary">{t('plan.travel.hint')}</Text>
      <QuestionInput
        question={START}
        answers={{ [START.id]: start }}
        issues={[]}
        onAnswer={(value) => setStart(String(value))}
        onClear={() => setStart(today)}
      />
      <QuestionInput
        question={END}
        answers={{ [END.id]: end }}
        issues={[]}
        onAnswer={(value) => setEnd(String(value))}
        onClear={() => setEnd(addDays(start, 6))}
      />
      {invalid ? (
        <Text style={{ color: colors.errorText }}>{t('plan.travel.endBeforeStart')}</Text>
      ) : null}
      <CheckRow label={t('plan.travel.pool')} checked={pool} onChange={setPool} />
      <CheckRow label={t('plan.travel.bike')} checked={bike} onChange={setBike} />
      {error ? <Text style={{ color: colors.errorText }}>{error}</Text> : null}
      <Button
        icon="travel"
        label={t('plan.travel.save')}
        disabled={invalid}
        onPress={() =>
          done(
            actions.setTravel([
              ...all,
              {
                startDate: start,
                endDate: end,
                ...(pool ? { poolAvailable: true } : {}),
                ...(bike ? { bikeAvailable: true } : {}),
              },
            ]),
          )
        }
      />
    </Screen>
  );
}
