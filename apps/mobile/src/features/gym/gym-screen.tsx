import { exercises, summarizeSession } from '@peakr/engine';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, IconBadge, Screen, SettingsGroup, SettingsRow, spacing, Text, useTheme } from '@/ui';

import { useGymExercises, useGymHistory, useGymRoutines } from './queries';

/**
 * Gym tab: the strength workspace (CLAUDE.md "Gym") – routines, exercise library, logging and the
 * import from another gym app. Live-session extras, history and statistics follow in later phases.
 */
export function GymScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const routines = useGymRoutines();
  const custom = useGymExercises();
  const history = useGymHistory();
  const activeRoutines = (routines.data ?? []).filter((r) => r.archivedAt === undefined);
  const last = history.data?.sessions[0];
  const lastSummary =
    last && history.data
      ? summarizeSession(last, history.data.sets, history.data.sets, custom.data)
      : null;

  return (
    <Screen title={t('gym.title')}>
      <Card style={styles.card} testID="gym-last-session">
        <View style={styles.head}>
          <IconBadge name="strength" color={colors.typeStrength} size={40} />
          <View style={styles.flex}>
            <Text variant="heading">{t('gym.hub.lastSession')}</Text>
            <Text variant="caption" tone="secondary">
              {last && lastSummary
                ? [
                    last.title || t('strength.quickLog.title'),
                    last.date,
                    last.kind === 'detailed'
                      ? t('gym.hub.lastSummary', {
                          sets: lastSummary.sets,
                          volume: Math.round(lastSummary.volumeKg),
                        })
                      : t('strength.minutes', { count: lastSummary.durationMin }),
                  ].join(' · ')
                : t('gym.hub.noSessions')}
            </Text>
          </View>
        </View>
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
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: 2 },
});
