import { RECOVERY_METRICS, recoverySignal, type Workout } from '@peakr/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { useHealthValues } from '@/features/health-data/queries';
import { usePlanActions } from '@/features/plan/queries';
import { Button, Card, Icon, spacing, Text, useTheme } from '@/ui';

import { formatAmount, metricLabel } from './metrics';
import { seriesOf } from './model';

/**
 * One short line on today's session when resting HR, HRV or sleep is clearly outside the user's
 * own range, with "Make today easier" that the user confirms. Nothing changes on its own and the
 * text only says what was measured (CLAUDE.md "Health").
 */
export function RecoveryLine({ workout }: { workout: Workout }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const today = todayIso();
  const { data: values = [] } = useHealthValues(RECOVERY_METRICS, shiftDays(today, -40));
  const actions = usePlanActions();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const signal = recoverySignal(
    Object.fromEntries(RECOVERY_METRICS.map((m) => [m, seriesOf(values, m)])),
    today,
  );
  if (signal.status !== 'ok' || signal.level !== 'clearly_off') return null;

  const parts = signal.reasons.slice(0, 2).map((r) =>
    t(r.direction === 'above' ? 'health.recovery.above' : 'health.recovery.below', {
      metric: metricLabel(t, r.metric),
      amount: formatAmount(t, r.metric, r.amount, i18n.language),
    }),
  );
  const line =
    parts.length === 2
      ? t('health.recovery.join', { first: parts[0], second: parts[1] })
      : (parts[0] ?? '');
  // Easing a session that is easy already would change nothing.
  const canEase =
    signal.suggestEasier && workout.intensity !== 'easy' && workout.intensity !== 'recovery';

  return (
    <Card testID={`recovery-line-${workout.id}`}>
      <View style={styles.inline}>
        <Icon name="heart" size={20} color={colors.textMuted} />
        <Text style={styles.flex}>{line}</Text>
      </View>
      <Text variant="caption" tone="secondary">
        {t('health.recovery.consult')}
      </Text>
      {done ? (
        <Text variant="caption" accessibilityLiveRegion="polite">
          {t('health.recovery.done')}
        </Text>
      ) : canEase && !confirming ? (
        <Button
          variant="secondary"
          small
          label={t('health.recovery.makeEasier')}
          onPress={() => setConfirming(true)}
        />
      ) : canEase ? (
        <View style={styles.gap}>
          <Text style={styles.strong}>{t('health.recovery.confirmTitle')}</Text>
          <Text variant="caption" tone="secondary">
            {t('health.recovery.confirmBody')}
          </Text>
          <View style={styles.row}>
            <Button
              small
              label={t('health.recovery.confirm')}
              onPress={() => {
                if (actions.ease([workout.id]).ok) setDone(true);
                setConfirming(false);
              }}
            />
            <Button
              small
              variant="secondary"
              label={t('health.recovery.cancel')}
              onPress={() => setConfirming(false)}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function shiftDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  strong: { fontWeight: '600' },
  gap: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
