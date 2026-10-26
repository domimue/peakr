import type { CoachAdjustment, CoachSummary } from '@peakr/engine';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { AddonGuard } from '@/features/billing/model';
import { Button, Card, Icon, numeric, ProgressBar, spacing, Text, useTheme } from '@/ui';

import type { BodyModel } from '../model';
import { useSaveGoal } from '../queries';

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

function adjustmentText(t: TFunction, a: CoachAdjustment): string {
  switch (a.kind) {
    case 'kcal':
      return t(`bodyAddon.coach.adjust.kcal.${a.reason}`, { kcal: signed(a.kcal) });
    case 'protein':
      return t('bodyAddon.coach.adjust.protein', { grams: a.grams });
    case 'strength':
      return t('bodyAddon.coach.adjust.strength', { count: a.sessions });
    case 'logging':
      return t('bodyAddon.coach.adjust.logging', { days: a.days });
  }
}

/**
 * The weekly coach: progress towards the goal, last week in numbers, what went well, what to
 * watch, up to three adjustments for the coming week and hints about the data. The engine picks
 * every item; this card only words them. A kcal suggestion is applied only when the user taps it.
 */
export function CoachCard({
  coach,
  model,
  guard,
}: {
  coach: CoachSummary;
  model: BodyModel;
  guard: AddonGuard;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const saveGoal = useSaveGoal();
  const goal = model.goal;
  const w = coach.lastWeek;
  const date = new Date(`${coach.week}T12:00:00`).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
  });
  const apply = (kcal: number) => {
    if (!goal) return;
    const { id: _id, createdAt: _at, ...rest } = goal;
    saveGoal.mutate({ ...rest, adjustmentKcal: goal.adjustmentKcal + kcal, reason: 'adaptive' });
  };
  const numbers = [
    w.trendChangeKg !== null
      ? t('bodyAddon.coach.numbers.trend', { kg: signed(w.trendChangeKg) })
      : null,
    w.avgIntakeKcal !== null
      ? t('bodyAddon.coach.numbers.intake', { kcal: w.avgIntakeKcal })
      : null,
    w.avgBalanceKcal !== null && w.fatKg !== null
      ? t('bodyAddon.coach.numbers.balance', {
          kcal: signed(w.avgBalanceKcal),
          kg: signed(w.fatKg),
        })
      : null,
    t('bodyAddon.coach.numbers.logged', { days: w.loggedDays, weighIns: w.weighInDays }),
    w.sessionsPlanned !== null
      ? t('bodyAddon.coach.numbers.training', { done: w.sessionsDone, planned: w.sessionsPlanned })
      : null,
  ].filter((x): x is string => x !== null);

  return (
    <Card style={styles.stack} testID="body-coach">
      <View style={styles.row}>
        <Icon name="sparkles" size={20} color={colors.textMuted} />
        <Text variant="heading" style={styles.flex}>
          {t('bodyAddon.coach.title')}
        </Text>
      </View>
      <Text variant="caption" tone="secondary">
        {t('bodyAddon.coach.week', { date })}
      </Text>
      {coach.progressPct !== null ? (
        <View style={styles.tight} testID="coach-progress">
          <ProgressBar
            progress={coach.progressPct / 100}
            accessibilityLabel={t('bodyAddon.coach.progress', { pct: coach.progressPct })}
          />
          <Text variant="caption" tone="secondary" style={numeric}>
            {t('bodyAddon.coach.progress', { pct: coach.progressPct })}
          </Text>
        </View>
      ) : null}

      <View style={styles.tight} testID="coach-numbers">
        {numbers.map((n) => (
          <Text key={n} style={numeric}>
            {n}
          </Text>
        ))}
      </View>

      {coach.wentWell.length > 0 ? (
        <View style={styles.tight} testID="coach-well">
          <Text variant="label">{t('bodyAddon.coach.wentWell')}</Text>
          {coach.wentWell.map((p) => (
            <Text key={p.key} tone="secondary">
              {`• ${t(`bodyAddon.coach.well.${p.key}`, p as Record<string, unknown>)}`}
            </Text>
          ))}
        </View>
      ) : null}

      {coach.watch.length > 0 ? (
        <View style={styles.tight} testID="coach-watch">
          <Text variant="label">{t('bodyAddon.coach.toWatch')}</Text>
          {coach.watch.map((p) => (
            <Text key={p.key} tone="secondary">
              {`• ${t(
                p.key === 'fastPace' && p.rate === null
                  ? 'bodyAddon.coach.watchItem.fastPaceNoRate'
                  : `bodyAddon.coach.watchItem.${p.key}`,
                p as Record<string, unknown>,
              )}`}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.tight} testID="coach-adjustments">
        <Text variant="label">{t('bodyAddon.coach.nextWeek')}</Text>
        {coach.adjustments.length === 0 ? (
          <Text tone="secondary">{t('bodyAddon.coach.noChanges')}</Text>
        ) : (
          coach.adjustments.map((a) => (
            <View key={a.kind} style={styles.tight}>
              <Text>{`• ${adjustmentText(t, a)}`}</Text>
              {/* The check-in suggestion has its button on the goal card below. */}
              {a.kind === 'kcal' && a.reason !== 'checkIn' && goal && guard.canWrite ? (
                <Button
                  small
                  variant="secondary"
                  testID="coach-apply-kcal"
                  label={t('bodyAddon.goal.apply', { kcal: signed(a.kcal) })}
                  onPress={() => apply(a.kcal)}
                />
              ) : null}
              {a.kind === 'strength' ? (
                <Button
                  small
                  variant="secondary"
                  label={t('bodyAddon.coach.openPlan')}
                  onPress={() => router.push('/plan')}
                />
              ) : null}
            </View>
          ))
        )}
      </View>

      {coach.hints.map((h) => (
        <Text key={h} variant="caption" tone="secondary" testID={`coach-hint-${h}`}>
          {t(`bodyAddon.coach.hint.${h}`)}
        </Text>
      ))}
      <Text variant="caption" tone="secondary">
        {t('bodyAddon.coach.footer')}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  tight: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
