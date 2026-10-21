import {
  allWorkouts,
  elapsedSec,
  exercises,
  getTemplate,
  liveProgress,
  muscleShades,
  recentWeeks,
  statusOf,
  summarizeSession,
  weeklyStats,
} from '@peakr/engine';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { usePlan } from '@/features/plan/queries';
import {
  Button,
  Card,
  IconBadge,
  radius,
  Screen,
  SettingsGroup,
  SettingsRow,
  spacing,
  Text,
  useTheme,
} from '@/ui';

import { useActiveWorkoutStore } from './active-workout-store';
import { formatClock, formatKg, formatVolume } from './format';
import { useLiveSessionStore } from './live-session-store';
import { useGymExercises, useGymHistory, useGymRoutines } from './queries';
import { useNow } from './use-now';

const RECENT = 3;
const MUSCLES_SHOWN = 6;

/**
 * Gym tab (CLAUDE.md "Gym"): the running session, start empty / from a routine / today's planned
 * strength session, the last sessions, this week's sets per muscle group and the workspace links.
 */
export function GymScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const routines = useGymRoutines();
  const custom = useGymExercises();
  const history = useGymHistory();
  const plan = usePlan();
  const live = useLiveSessionStore((s) => s.live);
  const now = useNow(1000, live !== null);
  const activeRoutines = (routines.data ?? []).filter((r) => r.archivedAt === undefined);
  const sessions = history.data?.sessions ?? [];
  const sets = history.data?.sets ?? [];
  const today = todayIso();
  const kg = t('units.kg');

  const stored = plan.data;
  const plannedToday = stored
    ? allWorkouts(stored.state.plan).find(
        (w) =>
          w.date === today && w.sport === 'strength' && statusOf(stored.state, w.id) === 'planned',
      )
    : undefined;

  const [week] = weeklyStats(sessions, sets, recentWeeks(today, 1), custom.data);
  const weekMuscles = week
    ? muscleShades(week.muscles)
        .filter((m) => m.sets > 0)
        .sort((a, b) => b.sets - a.sets)
        .slice(0, MUSCLES_SHOWN)
    : [];

  return (
    <Screen title={t('gym.title')}>
      {live ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/gym/live')}>
          <Card style={[styles.live, { borderColor: colors.accentLine }]} testID="gym-live-banner">
            <View style={styles.head}>
              <IconBadge name="strength" color={colors.typeStrength} size={40} />
              <View style={styles.flex}>
                <Text variant="heading">{t('gym.hub.running', { title: live.title })}</Text>
                <Text variant="caption" tone="secondary">
                  {t('gym.hub.runningInfo', {
                    time: formatClock(elapsedSec(live, now)),
                    done: liveProgress(live).done,
                  })}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.accentLine }}>{t('gym.hub.continue')}</Text>
          </Card>
        </Pressable>
      ) : (
        <>
          {plannedToday ? (
            <Card testID="gym-planned-today">
              <Text variant="caption" tone="secondary">
                {t('gym.hub.plannedToday')}
              </Text>
              <Text variant="heading">
                {plannedToday.templateId.startsWith('routine:')
                  ? (activeRoutines.find((r) => `routine:${r.id}` === plannedToday.templateId)
                      ?.name ?? t('strength.types.routine'))
                  : (t(
                      `strength.types.${getTemplate(plannedToday.templateId).type}` as never,
                    ) as string)}
              </Text>
              <Text variant="caption" tone="secondary">
                {t('gym.hub.plannedInfo', {
                  minutes: plannedToday.durationMin,
                  count: plannedToday.exercises?.length ?? 0,
                })}
              </Text>
              <Button
                icon="strength"
                label={t('gym.hub.startPlanned')}
                onPress={() => {
                  useActiveWorkoutStore.getState().setWorkout(plannedToday);
                  router.push({ pathname: '/gym/session', params: { workoutId: plannedToday.id } });
                }}
              />
            </Card>
          ) : null}
          <View style={styles.startRow}>
            <View style={styles.flex}>
              <Button
                variant={plannedToday ? 'secondary' : 'primary'}
                icon="plus"
                label={t('gym.hub.startEmpty')}
                onPress={() => router.push({ pathname: '/gym/session', params: { empty: '1' } })}
              />
            </View>
            <View style={styles.flex}>
              <Button
                variant="secondary"
                icon="structure"
                label={t('gym.hub.startRoutine')}
                onPress={() => router.push('/gym/routines')}
              />
            </View>
          </View>
        </>
      )}

      <Card style={styles.card} testID="gym-last-session">
        <Text variant="heading">{t('gym.hub.recent')}</Text>
        {sessions.length === 0 ? (
          <Text variant="caption" tone="secondary">
            {t('gym.hub.noSessions')}
          </Text>
        ) : null}
        {sessions.slice(0, RECENT).map((s) => {
          const summary = summarizeSession(s, sets, [], custom.data);
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/gym/history/[id]', params: { id: s.id } })}
              style={styles.recent}
            >
              <View style={[styles.typeBar, { backgroundColor: colors.typeStrength }]} />
              <View style={styles.flex}>
                <Text variant="label">{s.title || t('strength.quickLog.title')}</Text>
                <Text variant="caption" tone="secondary">
                  {[
                    s.date,
                    t('strength.minutes', { count: summary.durationMin }),
                    s.kind === 'detailed'
                      ? t('gym.hub.lastSummary', {
                          sets: summary.sets,
                          volume: formatVolume(summary.volumeKg, i18n.language),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </Card>

      <Card testID="gym-week-muscles">
        <Text variant="heading">{t('gym.hub.weekMuscles')}</Text>
        {weekMuscles.length === 0 ? (
          <Text variant="caption" tone="secondary">
            {t('gym.stats.nothing')}
          </Text>
        ) : null}
        {weekMuscles.map((m) => (
          <View key={m.muscle} style={styles.muscle}>
            <Text style={styles.muscleName}>{t(`gym.muscles.${m.muscle}` as never)}</Text>
            <View style={[styles.track, { backgroundColor: colors.surface2 }]}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.min(100, (m.sets / m.band.max) * 100)}%`,
                    backgroundColor: colors.typeStrength,
                  },
                ]}
              />
            </View>
            <Text variant="caption" style={styles.muscleValue}>
              {formatKg(m.sets)}
            </Text>
          </View>
        ))}
        {week ? (
          <Text variant="caption" tone="secondary">
            {t('gym.hub.weekTotals', {
              sessions: week.sessions,
              sets: week.sets,
              volume: formatVolume(week.volumeKg, i18n.language),
              unit: kg,
            })}
          </Text>
        ) : null}
      </Card>

      <SettingsGroup title={t('gym.hub.train')}>
        <SettingsRow
          icon="structure"
          title={t('strength.routines.title')}
          value={t('gym.hub.routineCount', { count: activeRoutines.length })}
          onPress={() => router.push('/gym/routines')}
        />
        <SettingsRow
          icon="sessions"
          title={t('strength.quickLog.title')}
          onPress={() => router.push('/gym/quick-log')}
        />
      </SettingsGroup>
      <SettingsGroup title={t('gym.hub.insights')}>
        <SettingsRow
          icon="calendar"
          title={t('gym.history.title')}
          value={t('gym.hub.sessionCount', { count: sessions.length })}
          onPress={() => router.push('/gym/history')}
        />
        <SettingsRow
          icon="progress"
          title={t('gym.stats.title')}
          onPress={() => router.push('/gym/stats')}
        />
      </SettingsGroup>
      <SettingsGroup title={t('gym.hub.library')}>
        <SettingsRow
          icon="book"
          title={t('gym.library.title')}
          value={t('gym.hub.exerciseCount', {
            count: exercises.length + (custom.data?.length ?? 0),
          })}
          onPress={() => router.push('/gym/library')}
        />
        <SettingsRow
          icon="upload"
          title={t('gym.import.title')}
          onPress={() => router.push('/gym/import')}
        />
      </SettingsGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  live: { borderWidth: 1.5, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  startRow: { flexDirection: 'row', gap: spacing.sm },
  recent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  typeBar: { width: 4, alignSelf: 'stretch', borderRadius: radius.pill },
  muscle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muscleName: { width: 120 },
  muscleValue: { width: 32, textAlign: 'right' },
  track: { flex: 1, height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
