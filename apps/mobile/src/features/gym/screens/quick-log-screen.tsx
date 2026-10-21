import { summarizeStrengthLog, type StrengthLog } from '@peakr/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { todayIso } from '@/data/ids';
import { Button, Card, Screen, SegmentedControl, Stepper, Text } from '@/ui';

import { usePlanActions } from '@/features/plan/queries';

import { useSaveGymSession } from '../queries';
import { buildQuickSession } from '../session';

/** Quick log (§8.7): duration, session RPE and whether the legs were trained. */
export function QuickLogScreen({ sourceId, workoutId }: { sourceId?: string; workoutId?: string }) {
  const { t } = useTranslation();
  const save = useSaveGymSession();
  const planActions = usePlanActions();
  const [durationMin, setDurationMin] = useState(45);
  const [rpe, setRpe] = useState(7);
  const [legs, setLegs] = useState<'yes' | 'no'>('no');

  const log: StrengthLog = { kind: 'quick', durationMin, rpe, legs: legs === 'yes' };
  const summary = summarizeStrengthLog(log);

  return (
    <Screen>
      <Text tone="secondary">{t('strength.quickLog.intro')}</Text>
      <Stepper
        label={t('strength.quickLog.duration')}
        value={durationMin}
        min={5}
        max={180}
        step={5}
        onChange={setDurationMin}
        format={(n) => t('strength.minutes', { count: n })}
        decreaseLabel={t('common.decrease')}
        increaseLabel={t('common.increase')}
      />
      <Stepper
        label={t('strength.quickLog.rpe')}
        value={rpe}
        min={1}
        max={10}
        onChange={setRpe}
        decreaseLabel={t('common.decrease')}
        increaseLabel={t('common.increase')}
      />
      <Text variant="caption" tone="secondary">
        {t('strength.quickLog.rpeHint')}
      </Text>
      <Text variant="caption" style={{ fontWeight: '600' }}>
        {t('strength.quickLog.legs')}
      </Text>
      <SegmentedControl
        options={[
          { value: 'no', label: t('common.no') },
          { value: 'yes', label: t('common.yes') },
        ]}
        value={legs}
        onChange={setLegs}
      />
      <Card>
        <Text>{t('strength.quickLog.load', { load: Math.round(summary.load) })}</Text>
        <Text variant="caption" tone="secondary">
          {summary.hard ? t('strength.quickLog.hard') : t('strength.quickLog.easy')}
        </Text>
      </Card>
      <Button
        label={t('strength.quickLog.save')}
        disabled={save.isPending}
        onPress={() => {
          const session = buildQuickSession({
            date: todayIso(),
            now: Date.now(),
            durationMin,
            rpe,
            legs: legs === 'yes',
            ...(sourceId ? { sourceId } : {}),
            ...(workoutId ? { plannedWorkoutId: workoutId } : {}),
          });
          save.mutate(
            { session, sets: [] },
            {
              onSuccess: () => {
                // Counts towards the plan's load; a planned workout is marked done.
                planActions.absorbGym(session, [], []);
                router.back();
              },
            },
          );
        }}
      />
    </Screen>
  );
}
