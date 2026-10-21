import { gymHistoryByMonth } from '@peakr/engine';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Screen, spacing, Text, useTheme } from '@/ui';

import { formatVolume } from '../format';
import { useGymExercises, useGymHistory } from '../queries';

/** Gym history (CLAUDE.md "Gym"): sessions grouped by month with duration, volume and muscles. */
export function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const custom = useGymExercises();
  const history = useGymHistory();
  if (custom.isPending || history.isPending) return <Screen />;
  const months = gymHistoryByMonth(
    history.data?.sessions ?? [],
    history.data?.sets ?? [],
    custom.data,
  );
  const kg = t('units.kg');

  const monthName = (month: string) =>
    new Date(`${month}-01T12:00:00Z`).toLocaleDateString(i18n.language, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

  return (
    <Screen>
      {months.length === 0 ? <Text tone="secondary">{t('gym.hub.noSessions')}</Text> : null}
      {months.map((m) => (
        <View key={m.month} style={styles.month} testID={`history-${m.month}`}>
          <View style={styles.monthHead}>
            <Text variant="heading" accessibilityRole="header" style={styles.flex}>
              {monthName(m.month)}
            </Text>
            <Text variant="caption" tone="secondary">
              {t('gym.history.monthTotals', {
                count: m.sessions,
                volume: formatVolume(m.volumeKg, i18n.language),
                unit: kg,
                minutes: m.durationMin,
              })}
            </Text>
          </View>
          {m.entries.map(({ session, summary }) => (
            <Pressable
              key={session.id}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/gym/history/[id]', params: { id: session.id } })
              }
            >
              <Card style={[styles.card, { borderLeftColor: colors.typeStrength }]}>
                <View style={styles.monthHead}>
                  <Text variant="label" style={styles.flex}>
                    {session.title || t('strength.quickLog.title')}
                  </Text>
                  <Text variant="caption" tone="secondary">
                    {session.date}
                  </Text>
                </View>
                <Text variant="caption" tone="secondary">
                  {[
                    t('strength.minutes', { count: summary.durationMin }),
                    session.kind === 'detailed'
                      ? `${formatVolume(summary.volumeKg, i18n.language)} ${kg}`
                      : t('gym.history.quick'),
                    session.kind === 'detailed'
                      ? t('gym.history.sets', { count: summary.sets })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {summary.muscles.length > 0 ? (
                  <Text variant="caption">
                    {summary.muscles
                      .slice(0, 4)
                      .map((x) => t(`gym.muscles.${x.muscle}` as never))
                      .join(', ')}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  month: { gap: spacing.sm },
  monthHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  card: { borderLeftWidth: 4, gap: spacing.xs },
});
