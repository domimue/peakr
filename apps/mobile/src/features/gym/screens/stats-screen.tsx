import {
  muscleShades,
  recentWeeks,
  trainingFrequency,
  weeklyStats,
  type MuscleShade,
} from '@peakr/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { Card, IconButton, radius, Screen, spacing, StatTile, Text, useTheme } from '@/ui';

import { BodyMap } from '../figures/body-map';
import { formatKg, formatVolume } from '../format';
import { GymBarChart } from '../gym-charts';
import { useGymExercises, useGymHistory } from '../queries';

const WEEKS = 8;

/**
 * Gym statistics (CLAUDE.md "Gym"): volume per week, sets per muscle group per week against a
 * target band, training frequency and a body map of the muscles trained in the chosen week.
 */
export function StatsScreen() {
  const { t, i18n } = useTranslation();
  const custom = useGymExercises();
  const history = useGymHistory();
  const [offset, setOffset] = useState(0);
  if (custom.isPending || history.isPending) return <Screen />;

  const weeks = weeklyStats(
    history.data?.sessions ?? [],
    history.data?.sets ?? [],
    recentWeeks(todayIso(), WEEKS),
    custom.data,
  );
  const week = weeks[weeks.length - 1 - offset] ?? weeks[weeks.length - 1];
  if (!week) return <Screen />;
  const shades = muscleShades(week.muscles);
  const trained = shades.filter((s) => s.sets > 0).sort((a, b) => b.sets - a.sets);
  const kg = t('units.kg');
  const short = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'numeric',
      timeZone: 'UTC',
    });
  const weekLabel =
    offset === 0
      ? t('gym.stats.thisWeek')
      : offset === 1
        ? t('gym.stats.lastWeek')
        : t('gym.stats.weekOf', { date: short(week.weekStart) });

  return (
    <Screen>
      <View style={styles.tiles}>
        <StatTile
          value={String(week.sessions)}
          label={t('gym.stats.sessions')}
          testID="stats-sessions"
        />
        <StatTile value={String(week.sets)} label={t('gym.stats.sets')} testID="stats-sets" />
        <StatTile
          value={`${formatVolume(week.volumeKg, i18n.language)} ${kg}`}
          label={t('gym.stats.volume')}
          testID="stats-volume"
        />
      </View>

      <Card>
        <Text variant="heading">{t('gym.stats.volumePerWeek')}</Text>
        <GymBarChart
          testID="stats-volume-chart"
          bars={weeks.map((w) => ({
            key: w.weekStart,
            label: short(w.weekStart),
            value: w.volumeKg,
          }))}
          accessibilityLabel={t('gym.stats.volumeChart', {
            values: weeks
              .map((w) => `${short(w.weekStart)}: ${formatVolume(w.volumeKg, i18n.language)} ${kg}`)
              .join(', '),
          })}
        />
      </Card>

      <Card>
        <Text variant="heading">{t('gym.stats.frequency')}</Text>
        <Text tone="secondary">
          {t('gym.stats.frequencyAvg', { value: formatKg(trainingFrequency(weeks)), weeks: WEEKS })}
        </Text>
        <GymBarChart
          testID="stats-frequency-chart"
          bars={weeks.map((w) => ({
            key: w.weekStart,
            label: short(w.weekStart),
            value: w.sessions,
          }))}
          accessibilityLabel={t('gym.stats.frequencyChart', {
            values: weeks.map((w) => `${short(w.weekStart)}: ${w.sessions}`).join(', '),
          })}
        />
      </Card>

      <Card>
        <View style={styles.weekRow}>
          <IconButton
            icon="chevronLeft"
            accessibilityLabel={t('gym.stats.previousWeek')}
            disabled={offset >= WEEKS - 1}
            onPress={() => setOffset(offset + 1)}
          />
          <Text variant="heading" style={styles.weekTitle} accessibilityLiveRegion="polite">
            {weekLabel}
          </Text>
          <IconButton
            icon="chevronRight"
            accessibilityLabel={t('gym.stats.nextWeek')}
            disabled={offset === 0}
            onPress={() => setOffset(offset - 1)}
          />
        </View>
        <BodyMap
          shades={shades}
          accessibilityLabel={t('gym.stats.bodyMapLabel', {
            muscles:
              trained
                .map((s) => `${t(`gym.muscles.${s.muscle}` as never)} ${formatKg(s.sets)}`)
                .join(', ') || t('gym.stats.nothing'),
          })}
        />
        <Text variant="label">{t('gym.stats.setsPerMuscle')}</Text>
        <Text variant="caption" tone="secondary">
          {t('gym.stats.bandHint')}
        </Text>
        {trained.length === 0 ? <Text tone="secondary">{t('gym.stats.nothing')}</Text> : null}
        {trained.map((s) => (
          <MuscleRow key={s.muscle} shade={s} />
        ))}
      </Card>
    </Screen>
  );
}

/** Sets of one muscle group with its target band drawn behind the bar. */
function MuscleRow({ shade }: { shade: MuscleShade }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const scale = Math.max(shade.band.max * 1.25, shade.sets);
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%` as const;
  return (
    <View style={styles.muscle} testID={`muscle-${shade.muscle}`}>
      <View style={styles.muscleHead}>
        <Text style={styles.flex}>{t(`gym.muscles.${shade.muscle}` as never)}</Text>
        <Text variant="caption" tone="secondary">
          {t('gym.stats.muscleSets', {
            sets: formatKg(shade.sets),
            min: shade.band.min,
            max: shade.band.max,
          })}{' '}
          · {t(`gym.stats.status.${shade.status}`)}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surface2 }]}>
        <View
          style={[
            styles.band,
            {
              left: pct(shade.band.min),
              width: pct(shade.band.max - shade.band.min),
              borderColor: colors.textMuted,
            },
          ]}
        />
        <View
          style={[styles.fill, { width: pct(shade.sets), backgroundColor: colors.typeStrength }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weekTitle: { flex: 1, textAlign: 'center' },
  muscle: { gap: spacing.xs },
  muscleHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  track: { height: 10, borderRadius: radius.pill, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, borderWidth: 1, borderRadius: radius.pill },
  fill: { height: '100%', borderRadius: radius.pill },
});
