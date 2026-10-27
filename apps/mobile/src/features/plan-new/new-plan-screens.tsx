import { generatePlan, planOutcome } from '@peakr/engine';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { useBaselineStore } from '@/features/baseline/baseline-store';
import { localToday, useQuizStore } from '@/features/onboarding/quiz-store';
import { Button, Card, ListState, Screen, spacing, Text } from '@/ui';

import { formatDate } from '../plan/calendar';
import { useCreatePlan, usePlan } from '../plan/queries';
import { goalName } from '../plan-history/badges';
import { newPlanInput } from './calibrate';
import { usePreviousPlan } from './previous';
import { useNewPlanFlow } from './flow-store';
import { startNewPlan } from './start';

/**
 * Start of "Create a new plan" (Profile): what happens to the current plan, then the quiz with
 * the earlier answers, the Strava recalibration, the forecast and the confirmation.
 */
export function NewPlanStartScreen() {
  const { t } = useTranslation();
  const { data: current, isPending } = usePlan();
  const { previous } = usePreviousPlan();
  if (isPending) return <ListState kind="loading" label={t('common.loading')} />;
  return (
    <Screen title={t('planNew.title')}>
      <Text tone="secondary">{t('planNew.intro')}</Text>
      {current ? (
        <Card>
          <Text variant="label">
            {t('planNew.current', { goal: goalName(t, current.state.plan.goal.kind) })}
          </Text>
          <Text tone="secondary">{t('planNew.archived')}</Text>
        </Card>
      ) : null}
      <Button
        label={t('planNew.start')}
        onPress={async () => {
          await startNewPlan(previous);
          router.push('/onboarding/quiz');
        }}
        testID="new-plan-start"
      />
    </Screen>
  );
}

/**
 * The last step: start date, what is archived, what stays and what goes. Nothing changes before
 * "Start my new plan"; a plan below what the user already does is not built (the reason is shown).
 */
export function NewPlanConfirmScreen() {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => localToday(), []);
  const { data: current } = usePlan();
  const { previous } = usePreviousPlan();
  const answers = useQuizStore((s) => s.answers);
  const baseline = useBaselineStore();
  const create = useCreatePlan();
  const end = useNewPlanFlow((s) => s.end);

  const built = useMemo(() => {
    const input = newPlanInput(answers, baseline, previous, today);
    if (!input) return null;
    const plan = generatePlan(
      input.profile,
      input.goal,
      input.availability,
      input.startDate,
      input.targetDate,
    );
    return { input, plan };
  }, [answers, baseline, previous, today]);

  if (!built) {
    return (
      <Screen title={t('planNew.confirm.title')}>
        <Text>{t('quiz.forecast.error')}</Text>
        <Button
          label={t('quiz.forecast.editAnswers')}
          onPress={() => router.replace('/onboarding/quiz')}
        />
      </Screen>
    );
  }
  const { input, plan } = built;
  const date = (iso: string) => formatDate(iso, i18n.language, { dateStyle: 'full' });
  const outcome = current
    ? planOutcome(current.state, current.input.profile, todayIso()).outcome
    : null;

  const confirm = () => {
    const { profile, goal, availability, startDate, targetDate, hrZones, stravaHrZones } = input;
    create.mutate(
      {
        profile,
        goal,
        availability,
        startDate,
        hrZones,
        ...(targetDate ? { targetDate } : {}),
        ...(stravaHrZones ? { stravaHrZones } : {}),
        // Manual zones from Profile → Training zones stay.
        ...(previous?.input.zones ? { zones: previous.input.zones } : {}),
      },
      {
        onSuccess: () => {
          end();
          router.replace('/today');
        },
      },
    );
  };

  return (
    <Screen title={t('planNew.confirm.title')}>
      <Card testID="new-plan-summary">
        <Text variant="label">{goalName(t, input.goal.kind)}</Text>
        <Text>{t('planNew.confirm.starts', { date: date(input.startDate) })}</Text>
      </Card>
      {current && outcome ? (
        <Card>
          <Text variant="label">
            {t('planNew.confirm.archive', { goal: goalName(t, current.state.plan.goal.kind) })}
          </Text>
          <Text tone="secondary">{t(`planNew.confirm.outcome.${outcome}`)}</Text>
        </Card>
      ) : null}
      <View style={styles.list}>
        <Text variant="label">{t('planNew.confirm.staysTitle')}</Text>
        {(['sessions', 'activities', 'gym', 'body'] as const).map((k) => (
          <Text key={k}>{`•  ${t(`planNew.confirm.stays.${k}`)}`}</Text>
        ))}
      </View>
      <View style={styles.list}>
        <Text variant="label">{t('planNew.confirm.goesTitle')}</Text>
        {(['planned', 'changes', 'weeks'] as const).map((k) => (
          <Text key={k}>{`•  ${t(`planNew.confirm.goes.${k}`)}`}</Text>
        ))}
      </View>
      <Text variant="caption" tone="secondary">
        {t('planNew.confirm.undo')}
      </Text>
      {plan.ok ? (
        <Button
          label={t('planNew.confirm.action')}
          disabled={create.isPending}
          onPress={confirm}
          testID="new-plan-confirm"
        />
      ) : (
        <>
          <Text tone="danger" testID="new-plan-error">
            {plan.issues[0]
              ? t(`validation.${plan.issues[0].code}`, plan.issues[0].params ?? {})
              : t('quiz.forecast.error')}
          </Text>
          <Button
            label={t('quiz.forecast.editAnswers')}
            onPress={() => router.replace('/onboarding/quiz')}
          />
        </>
      )}
      {create.isError ? <Text tone="danger">{t('planNew.confirm.failed')}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
});
