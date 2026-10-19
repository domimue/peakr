import {
  SPORTS,
  statusOf,
  summarizeWorkouts,
  type PlanState,
  type PlanWeek,
  type UserProfile,
} from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, numeric, spacing, Text, useTheme, type IconName } from '@/ui';

import { SPORT_ICON } from '../kind';

export interface WeekSummaryProps {
  week: PlanWeek;
  state: PlanState;
  profile: UserProfile;
}

/** The week at a glance: number of sessions and estimated km per discipline. */
export function WeekSummary({ week, state, profile }: WeekSummaryProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const counted = week.workouts.filter((w) => statusOf(state, w.id) !== 'skipped');
  const summary = summarizeWorkouts(counted, profile);
  const done = counted.filter((w) => statusOf(state, w.id) === 'done').length;

  const stats: { icon: IconName; value: string; label: string; color: string }[] = [
    {
      icon: 'sessions',
      value: done > 0 ? `${done}/${summary.sessions}` : String(summary.sessions),
      label: t('plan.summary.sessions', { count: summary.sessions }),
      color: colors.text,
    },
    ...SPORTS.filter((s) => summary.distances[s] !== undefined).map((s) => ({
      icon: SPORT_ICON[s],
      value: t('plan.km', { value: Math.round(summary.distances[s] ?? 0) }),
      label: t(`plan.sports.${s}`),
      color: colors[s === 'run' ? 'sportRun' : s === 'bike' ? 'sportBike' : 'sportSwim'],
    })),
  ];

  return (
    <Card style={styles.card} testID="week-summary">
      {stats.map((s) => (
        <View
          key={s.icon}
          style={styles.stat}
          accessible
          accessibilityLabel={`${s.value} ${s.label}`}
        >
          <Icon name={s.icon} size={22} color={s.color} />
          <View>
            <Text variant="label" style={numeric}>
              {s.value}
            </Text>
            <Text variant="micro" tone="secondary">
              {s.label}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    gap: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
