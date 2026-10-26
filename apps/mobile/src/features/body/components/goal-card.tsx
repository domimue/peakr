import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { AddonGuard } from '@/features/billing/model';
import { Button, Card, numeric, spacing, Text } from '@/ui';

import { useBodyModel } from '../model';
import { useSaveGoal } from '../queries';

/** Step of the reverse diet after the target was reached (kcal per week). */
const REVERSE_STEP = 100;

/**
 * The weight goal in Body: today's target, protein, both forecasts, the weekly check-in with its
 * suggestion, plateau and "target reached" hints and the training interaction. Every change –
 * accepting a suggestion, pausing, switching to maintain – is a new goal version with its reason.
 * Wording stays gentle: suggestions, never pressure.
 */
export function GoalCard({ guard }: { guard: AddonGuard }) {
  const { t, i18n } = useTranslation();
  const model = useBodyModel();
  const saveGoal = useSaveGoal();
  if (!model) return null;
  const { goal, goalSnapshot: snap } = model;
  const date = (iso: string | null) =>
    iso
      ? new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { dateStyle: 'medium' })
      : '–';
  const save = (changes: Partial<NonNullable<typeof goal>>, reason: 'user' | 'adaptive') => {
    if (!goal) return;
    const { id: _id, createdAt: _at, ...rest } = goal;
    saveGoal.mutate({ ...rest, ...changes, reason });
  };

  if (!goal) {
    return (
      <Card style={styles.card} testID="goal-card-empty">
        <Text variant="heading">{t('bodyAddon.goal.title')}</Text>
        <Text tone="secondary">{t('bodyAddon.goal.none')}</Text>
        {guard.canWrite ? (
          <Button
            variant="secondary"
            label={t('bodyAddon.goal.set')}
            onPress={() => router.push('/body/goal')}
          />
        ) : null}
      </Card>
    );
  }

  const actions = guard.canWrite ? (
    <View style={styles.row}>
      <Button
        small
        variant="secondary"
        label={t('bodyAddon.goal.changeGoal')}
        onPress={() => router.push('/body/goal')}
      />
      <Button
        small
        variant="secondary"
        testID="goal-pause"
        label={t(goal.paused ? 'bodyAddon.goal.resume' : 'bodyAddon.goal.pause')}
        onPress={() => save({ paused: !goal.paused }, 'user')}
      />
    </View>
  ) : null;

  if (goal.paused || !snap) {
    return (
      <Card style={styles.card} testID="goal-card">
        <Text variant="heading">{t('bodyAddon.goal.title')}</Text>
        <Text tone="secondary">{t('bodyAddon.goal.paused')}</Text>
        {actions}
      </Card>
    );
  }

  const { targets, forecast, checkIn, plateau, training } = snap;
  const reverseDue = goal.kind === 'maintain' && goal.adjustmentKcal < 0;

  return (
    <Card style={styles.card} testID="goal-card">
      <Text variant="heading">{t('bodyAddon.goal.title')}</Text>
      <Text tone="secondary">
        {goal.kind === 'maintain'
          ? t('bodyAddon.goal.summaryMaintain', { kg: model.trendKg })
          : t('bodyAddon.goal.summaryChange', {
              from: model.trendKg,
              to: goal.targetWeightKg,
              rate: targets.ratePerWeekKg,
            })}
      </Text>
      <Text variant="title" style={numeric}>
        {t('bodyAddon.goal.todayKcal', { kcal: model.targetKcal })}
      </Text>
      <Text tone="secondary" style={numeric}>
        {t('bodyAddon.goal.protein', {
          grams: targets.protein.grams,
          perKg: targets.protein.gPerKg,
        })}
      </Text>
      {targets.floorApplied ? (
        <Text>
          {t('bodyAddon.goal.floor', {
            kcal: targets.floorKcal,
            rate: targets.effectiveRatePerWeekKg,
          })}
        </Text>
      ) : null}
      {goal.kind !== 'maintain' ? (
        <View testID="goal-forecast">
          <Text style={numeric}>
            {t('bodyAddon.goal.planned', { date: date(forecast.plannedDate) })}
          </Text>
          <Text tone="secondary" style={numeric}>
            {forecast.realDate
              ? t('bodyAddon.goal.real', {
                  date: date(forecast.realDate),
                  rate: forecast.realPaceKgPerWeek,
                })
              : t('bodyAddon.goal.realUnknown')}
          </Text>
        </View>
      ) : null}

      {checkIn && checkIn.status !== 'notEnoughData' ? (
        <View style={styles.block} testID="goal-check-in">
          <Text>
            {t(`bodyAddon.goal.checkIn.${checkIn.status}`, { rate: checkIn.actualRatePerWeekKg })}
          </Text>
          {checkIn.adjustmentKcal !== 0 && guard.canWrite ? (
            <Button
              small
              variant="secondary"
              label={t('bodyAddon.goal.apply', {
                kcal: `${checkIn.adjustmentKcal > 0 ? '+' : ''}${checkIn.adjustmentKcal}`,
              })}
              onPress={() =>
                save({ adjustmentKcal: goal.adjustmentKcal + checkIn.adjustmentKcal }, 'adaptive')
              }
            />
          ) : null}
        </View>
      ) : null}

      {plateau.plateau ? (
        <View style={styles.block} testID="goal-plateau">
          <Text>{t('bodyAddon.goal.plateau')}</Text>
          {guard.canWrite ? (
            <Button
              small
              variant="secondary"
              label={t('bodyAddon.goal.dietBreak')}
              onPress={() => save({ paused: true }, 'user')}
            />
          ) : null}
        </View>
      ) : null}

      {snap.reached ? (
        <View style={styles.block} testID="goal-reached">
          <Text>{t('bodyAddon.goal.reached')}</Text>
          {snap.reverseDiet.length > 0 ? (
            <Text tone="secondary">
              {t('bodyAddon.goal.reverse', { weeks: snap.reverseDiet.length, step: REVERSE_STEP })}
            </Text>
          ) : null}
          {guard.canWrite ? (
            <Button
              small
              variant="secondary"
              label={t('bodyAddon.goal.toMaintain')}
              onPress={() =>
                save(
                  {
                    kind: 'maintain',
                    targetWeightKg: null,
                    ratePerWeekKg: 0,
                    // Start where the deficit was; +100 kcal per week brings it to maintenance.
                    adjustmentKcal: -Math.max(0, targets.deficitKcal),
                  },
                  'user',
                )
              }
            />
          ) : null}
        </View>
      ) : null}

      {reverseDue && guard.canWrite ? (
        <View style={styles.block} testID="goal-reverse">
          <Text>{t('bodyAddon.goal.reverseStep', { kcal: -goal.adjustmentKcal })}</Text>
          <Button
            small
            variant="secondary"
            label={t('bodyAddon.goal.reverseApply', { step: REVERSE_STEP })}
            onPress={() =>
              save({ adjustmentKcal: Math.min(0, goal.adjustmentKcal + REVERSE_STEP) }, 'adaptive')
            }
          />
        </View>
      ) : null}

      {training.reason ? (
        <Text testID="goal-training">
          {t(`bodyAddon.goal.training.${training.reason}`, { kcal: training.suggestedDeficitKcal })}
        </Text>
      ) : null}
      {training.keyDayWarnings.length > 0 ? (
        <Text tone="secondary">
          {t('bodyAddon.goal.keyDays', { count: training.keyDayWarnings.length })}
        </Text>
      ) : null}
      <Text variant="caption" tone="secondary">
        {t('bodyAddon.goal.estimate')}
      </Text>
      {actions}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  block: { gap: spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
