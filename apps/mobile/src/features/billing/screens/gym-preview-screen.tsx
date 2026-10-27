import { allWorkouts, statusOf } from '@peakr/engine';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { useActiveWorkoutStore } from '@/features/gym/active-workout-store';
import { usePlan } from '@/features/plan/queries';
import { Badge, Button, Card, radius, Screen, spacing, Text, useTheme } from '@/ui';
import { TabTitle } from '@/features/profile/profile-button';

/** Clearly invented numbers: the preview shows what the statistics look like, never user data. */
const EXAMPLE_SETS = [
  { exercise: 'Bench press', sets: '4 × 8', kg: 70 },
  { exercise: 'Barbell row', sets: '4 × 8', kg: 60 },
  { exercise: 'Overhead press', sets: '3 × 10', kg: 40 },
  { exercise: 'Pull-up', sets: '3 × 6', kg: 0 },
];
const EXAMPLE_WEEK = [
  { muscle: 'Chest', sets: 12 },
  { muscle: 'Back', sets: 14 },
  { muscle: 'Shoulders', sets: 9 },
  { muscle: 'Legs', sets: 8 },
];
const EXAMPLE_MAX = 16;
const EXAMPLE_VOLUME = 6840;

/**
 * Gym tab without the add-on (CLAUDE.md "Gym", "UI patterns"): a real preview – a sample session
 * and example statistics, all marked as examples – and the way to the paywall. The planned
 * strength session of the day stays reachable: it can be read and marked done with duration and
 * effort, because the endurance plan never depends on the add-on.
 */
export function GymPreviewScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const plan = usePlan();
  const today = todayIso();
  const stored = plan.data;
  const plannedToday = stored
    ? allWorkouts(stored.state.plan).find(
        (w) =>
          w.date === today && w.sport === 'strength' && statusOf(stored.state, w.id) === 'planned',
      )
    : undefined;

  return (
    <Screen header={<TabTitle title={t('gymAddon.title')} />}>
      <Text tone="secondary">{t('gymAddon.tagline')}</Text>

      {plannedToday ? (
        <Card testID="gym-preview-planned">
          <Text variant="heading">{t('gymAddon.preview.plannedTitle')}</Text>
          <Text variant="caption" tone="secondary">
            {t('gymAddon.preview.plannedHint')}
          </Text>
          <Button
            variant="secondary"
            icon="check"
            label={t('gymAddon.preview.openPlanned')}
            onPress={() => {
              useActiveWorkoutStore.getState().setWorkout(plannedToday);
              router.push({ pathname: '/training/workout/[id]', params: { id: plannedToday.id } });
            }}
          />
        </Card>
      ) : null}

      <Card testID="gym-preview-session" style={styles.card}>
        <View style={styles.head}>
          <Text variant="heading" style={styles.flex}>
            {t('gymAddon.preview.sampleTitle')}
          </Text>
          <Badge label={t('gymAddon.exampleBadge')} />
        </View>
        {EXAMPLE_SETS.map((row) => (
          <View key={row.exercise} style={styles.row}>
            <Text style={styles.flex}>{row.exercise}</Text>
            <Text tone="secondary" style={styles.number}>
              {row.kg > 0 ? `${row.sets} · ${row.kg} kg` : row.sets}
            </Text>
          </View>
        ))}
        <Text variant="caption" tone="secondary">
          {t('gymAddon.preview.sampleSets', { sets: 14, volume: EXAMPLE_VOLUME })}
        </Text>
        <Text variant="caption" tone="secondary">
          {t('gymAddon.preview.sampleHint')}
        </Text>
      </Card>

      <Card testID="gym-preview-stats" style={styles.card}>
        <View style={styles.head}>
          <Text variant="heading" style={styles.flex}>
            {t('gymAddon.preview.exampleStats')}
          </Text>
          <Badge label={t('gymAddon.exampleBadge')} />
        </View>
        <Text variant="caption" tone="secondary">
          {t('gymAddon.preview.exampleBench')}:{' '}
          {t('gymAddon.preview.exampleBenchValue', { kg: 82.5, reps: 5 })}
        </Text>
        <Text variant="label">{t('gymAddon.preview.exampleWeek')}</Text>
        {EXAMPLE_WEEK.map((m) => (
          <View key={m.muscle} style={styles.row}>
            <Text style={styles.muscle}>{m.muscle}</Text>
            <View style={[styles.track, { backgroundColor: colors.surface2 }]}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${(m.sets / EXAMPLE_MAX) * 100}%`,
                    backgroundColor: colors.typeStrength,
                  },
                ]}
              />
            </View>
            <Text variant="caption" style={styles.number}>
              {m.sets}
            </Text>
          </View>
        ))}
        <Text variant="caption" tone="secondary">
          {t('gymAddon.preview.exampleStatsHint')}
        </Text>
      </Card>

      <Card style={styles.card}>
        {(['log', 'history', 'plan', 'offline'] as const).map((key) => (
          <Text key={key}>{`• ${t(`gymAddon.preview.features.${key}`)}`}</Text>
        ))}
      </Card>

      <Button label={t('gymAddon.preview.unlock')} onPress={() => router.push('/gym/addon')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  number: { fontVariant: ['tabular-nums'] },
  muscle: { width: 96 },
  track: { flex: 1, height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
