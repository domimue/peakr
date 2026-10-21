import { exerciseRecords, exerciseTimeline } from '@peakr/engine';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, spacing, Text, useTheme } from '@/ui';

import { formatKg, formatSet, formatVolume } from './format';
import { GymLineChart } from './gym-charts';
import { useGymHistory } from './queries';

/** Shown in the list of past sessions before "show all". */
const RECENT_SESSIONS = 10;

/**
 * An exercise's own history (CLAUDE.md "Gym"): personal records, charts of the estimated 1RM and
 * the heaviest set over time, and every past set.
 */
export function ExerciseProgress({ exerciseId }: { exerciseId: string }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const history = useGymHistory();
  if (history.isPending) return null;
  const sessions = history.data?.sessions ?? [];
  const sets = history.data?.sets ?? [];
  const timeline = exerciseTimeline(exerciseId, sessions, sets);
  if (timeline.length === 0) {
    return (
      <Card>
        <Text variant="heading">{t('gym.exercise.history')}</Text>
        <Text tone="secondary">{t('gym.exercise.noHistory')}</Text>
      </Card>
    );
  }
  const records = exerciseRecords(exerciseId, sets);
  const kg = t('units.kg');
  const dateOf = (sessionId: string) => sessions.find((s) => s.id === sessionId)?.date ?? '';
  const short = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'numeric',
      timeZone: 'UTC',
    });
  const charted = timeline.filter((p) => p.oneRm !== undefined || p.heaviestKg !== undefined);

  return (
    <>
      <Card testID="exercise-records">
        <Text variant="heading">{t('gym.records.title')}</Text>
        {records.heaviest ? (
          <Record
            label={t('gym.records.heaviest')}
            value={`${formatSet(records.heaviest, t('units.s'))} ${kg}`}
            date={dateOf(records.heaviest.sessionId)}
          />
        ) : null}
        {records.bestOneRm ? (
          <Record
            label={t('gym.records.bestOneRm')}
            value={`${formatKg(Math.round(records.bestOneRm.value * 10) / 10)} ${kg}`}
            hint={t('gym.records.fromSet', {
              set: `${formatSet(records.bestOneRm, t('units.s'))} ${kg}`,
            })}
            date={dateOf(records.bestOneRm.sessionId)}
          />
        ) : null}
        {records.bestSessionVolume ? (
          <Record
            label={t('gym.records.bestVolume')}
            value={`${formatVolume(records.bestSessionVolume.value, i18n.language)} ${kg}`}
            date={dateOf(records.bestSessionVolume.sessionId)}
          />
        ) : null}
        {records.reps !== undefined ? (
          <Record label={t('gym.records.mostReps')} value={String(records.reps)} />
        ) : null}
        {records.durationSec !== undefined ? (
          <Record
            label={t('gym.records.longest')}
            value={`${records.durationSec} ${t('units.s')}`}
          />
        ) : null}
        {records.repsAtWeight.length > 0 ? (
          <>
            <Text variant="label">{t('gym.records.repsAtWeight')}</Text>
            <Text tone="secondary">
              {records.repsAtWeight
                .slice(0, 8)
                .map((r) => `${formatKg(r.weightKg)} ${kg} × ${r.reps}`)
                .join(' · ')}
            </Text>
          </>
        ) : null}
        {records.bestOneRm ? (
          <Text variant="caption" tone="secondary">
            {t('gym.records.oneRmNote')}
          </Text>
        ) : null}
      </Card>

      {charted.length >= 2 ? (
        <Card>
          <Text variant="heading">{t('gym.exercise.progress')}</Text>
          <GymLineChart
            testID="exercise-chart"
            labels={charted.map((p) => short(p.date))}
            series={[
              {
                values: charted.map((p) => p.oneRm ?? null),
                color: colors.typeStrength,
                label: t('gym.exercise.chartOneRm'),
              },
              {
                values: charted.map((p) => p.heaviestKg ?? null),
                color: colors.textMuted,
                label: t('gym.exercise.chartHeaviest'),
              },
            ]}
            accessibilityLabel={t('gym.exercise.chartLabel', {
              values: charted
                .map((p) =>
                  [
                    short(p.date),
                    p.oneRm !== undefined ? `${formatKg(p.oneRm)} ${kg}` : null,
                    p.heaviestKg !== undefined ? `${formatKg(p.heaviestKg)} ${kg}` : null,
                  ]
                    .filter(Boolean)
                    .join(' '),
                )
                .join(', '),
            })}
          />
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">{t('gym.exercise.history')}</Text>
        {[...timeline]
          .reverse()
          .slice(0, RECENT_SESSIONS)
          .map((p) => (
            <Pressable
              key={p.sessionId}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/gym/history/[id]', params: { id: p.sessionId } })
              }
              style={styles.session}
            >
              <Text variant="label">{p.date}</Text>
              <Text tone="secondary">
                {p.sets
                  .map(
                    (s) =>
                      `${s.setType === 'warmup' ? `${t('gym.setTypes.short.warmup')} ` : ''}${formatSet(s, t('units.s'))}`,
                  )
                  .join(' · ')}
              </Text>
            </Pressable>
          ))}
        {timeline.length > RECENT_SESSIONS ? (
          <Text variant="caption" tone="secondary">
            {t('gym.exercise.olderSessions', { count: timeline.length - RECENT_SESSIONS })}
          </Text>
        ) : null}
      </Card>
    </>
  );
}

function Record({
  label,
  value,
  hint,
  date,
}: {
  label: string;
  value: string;
  hint?: string;
  date?: string;
}) {
  return (
    <View style={styles.record}>
      <View style={styles.flex}>
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
        {hint ? (
          <Text variant="micro" tone="secondary">
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text variant="label">{value}</Text>
        {date ? (
          <Text variant="micro" tone="secondary">
            {date}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  record: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  right: { alignItems: 'flex-end' },
  session: { gap: 2, paddingVertical: spacing.xs },
});
