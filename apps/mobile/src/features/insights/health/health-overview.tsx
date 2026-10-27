import { HEALTH_METRICS, METRIC_GROUP, type HealthGroup } from '@peakr/engine';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { useHealthStatus, useHealthSync, useHealthValues } from '@/features/health-data/queries';
import { useDeviceHealth } from '@/features/health-data/read-device';
import { Button, Card, LinkRow, ListState, numeric, radius, spacing, Text, useTheme } from '@/ui';

import type { HealthSyncInfo } from '@/features/health-data/api';

import { baselineLine, missingLines, recordedLine, timeOf, trendLine, vo2maxLine } from './format';
import { formatMetric, metricLabel, OVERVIEW_METRICS } from './metrics';
import { isConnected, metricState, periodStart, type MetricState, type Sources } from './model';

export const healthHref = (metric: string) => `/health/${metric}` as const;

/**
 * Body → Health overview: one tile per metric with today's value (or the latest recent one),
 * how it compares to the user's own baseline, the trend, and when and where it was recorded.
 * Metrics without a value say why. Nothing here interprets a value medically.
 */
export function HealthOverview() {
  const { t, i18n } = useTranslation();
  const today = todayIso();
  const { data: status, isPending } = useHealthStatus();
  const device = useDeviceHealth();
  const { data: values = [] } = useHealthValues(HEALTH_METRICS, periodStart(today, 'year'));
  const sync = useHealthSync();
  const groups = status?.groups ?? device.groups;
  const sources: Sources = { status, deviceProvides: device.provides, groups };
  const connected = isConnected(sources);

  // Fresh values whenever the overview opens (the server copy; a pull only on "Sync now").
  const { mutate } = sync;
  useEffect(() => {
    if (connected) mutate({ pull: false });
  }, [connected, mutate]);

  const states = useMemo(
    () => OVERVIEW_METRICS.map((m) => metricState(m.metric, values, sources, today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sources` is rebuilt every render
    [values, status, device.provides, groups, today],
  );

  if (isPending && !connected) return <ListState kind="loading" label={t('common.loading')} />;

  if (!connected) {
    return (
      <ListState
        kind="empty"
        icon="heart"
        title={t('health.empty.title')}
        message={t('health.empty.body')}
        actionLabel={t('health.empty.connect')}
        onAction={() => router.push('/health/consent')}
      />
    );
  }

  const shown = states.filter((s) => !(s.kind === 'missing' && s.reason === 'not_enabled'));
  const notEnabled = [
    ...new Set(
      states
        .filter((s) => s.kind === 'missing' && s.reason === 'not_enabled')
        .map((s) => METRIC_GROUP[s.metric]),
    ),
  ] as HealthGroup[];
  const connection = status?.connection;
  const sync0 = status?.sync;

  return (
    <View style={styles.gap} testID="health-overview">
      <View style={styles.gap}>
        {connection?.backfillDays === 0 ? (
          <Text variant="caption" tone="secondary">
            {t('health.overview.historyFromConnection')}
          </Text>
        ) : sync0?.earliestDay ? (
          <Text variant="caption" tone="secondary" testID="health-history-from">
            {t('health.overview.historyFrom', {
              date: new Intl.DateTimeFormat(i18n.language, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(new Date(`${sync0.earliestDay}T00:00:00Z`)),
            })}
          </Text>
        ) : null}
        {connection && connection.backfillDays > 0 && sync0 && !sync0.backfillDone ? (
          <Text variant="caption" tone="secondary">
            {t('health.overview.backfilling')}
          </Text>
        ) : null}
        {connection?.delivery === 'push' ? (
          <Text variant="caption" tone="secondary">
            {t('health.overview.pushHint')}
          </Text>
        ) : null}
        {sync0?.lastError ? (
          <Text variant="caption" tone="danger">
            {t('health.overview.syncError')}
          </Text>
        ) : null}
      </View>

      <View style={styles.grid}>
        {shown.map((s) => (
          <MetricTile
            key={s.metric}
            state={s}
            sync={sync0}
            today={today}
            language={i18n.language}
          />
        ))}
      </View>

      {notEnabled.length > 0 ? (
        <Card testID="health-not-enabled">
          <Text variant="caption" tone="secondary">
            {notEnabled
              .map((g) => t('health.missing.not_enabled', { group: t(`health.groups.${g}.title`) }))
              .join('\n')}
          </Text>
          <Button
            variant="secondary"
            small
            label={t('health.missing.turnOn')}
            onPress={() => router.push('/health/consent')}
            testID="health-turn-on"
          />
        </Card>
      ) : null}

      {connection?.delivery === 'pull' || device.provides.length > 0 ? (
        <View style={styles.syncRow}>
          <Button
            variant="secondary"
            small
            icon="reset"
            label={sync.isPending ? t('health.overview.syncing') : t('health.overview.syncNow')}
            disabled={sync.isPending}
            onPress={() => sync.mutate({ pull: true })}
          />
          {sync0?.lastPulledAt ? (
            <Text variant="caption" tone="secondary">
              {t('health.overview.lastSynced', { time: timeOf(sync0.lastPulledAt, i18n.language) })}
            </Text>
          ) : null}
        </View>
      ) : null}

      <LinkRow
        title={t('health.overview.settings')}
        icon="privacy"
        onPress={() => router.push('/health/consent')}
      />
      <Text variant="caption" tone="secondary">
        {t('health.baseline.ownHistory')}
      </Text>
    </View>
  );
}

function MetricTile({
  state,
  sync,
  today,
  language,
}: {
  state: MetricState;
  sync: HealthSyncInfo | undefined;
  today: string;
  language: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const label = metricLabel(t, state.metric);

  if (state.kind === 'missing') {
    const { reason, last } = missingLines(t, state, sync, language, today);
    return (
      <View
        style={[styles.tile, { backgroundColor: colors.surface }]}
        accessible
        accessibilityLabel={[`${label}: ${reason}`, last].filter(Boolean).join('. ')}
        testID={`health-tile-${state.metric}`}
      >
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
        <Text variant="caption" tone="secondary">
          {reason}
        </Text>
        {last ? (
          <Text variant="micro" tone="secondary" style={numeric}>
            {last}
          </Text>
        ) : null}
      </View>
    );
  }

  const value = formatMetric(t, state.metric, state.latest.value, language);
  const baseline = baselineLine(t, state);
  const trend = trendLine(t, state);
  const recorded = recordedLine(t, state.latest, state.ageDays, language);
  const from = vo2maxLine(t, state.latest);
  return (
    <Pressable
      onPress={() => router.push(healthHref(state.metric))}
      accessibilityRole="button"
      accessibilityLabel={[label, value, baseline, trend, from, recorded]
        .filter(Boolean)
        .join('. ')}
      testID={`health-tile-${state.metric}`}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: pressed ? colors.surface2 : colors.surface },
      ]}
    >
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <Text variant="heading" style={numeric}>
        {value}
      </Text>
      <Text variant="caption">{baseline}</Text>
      {trend ? (
        <Text variant="caption" tone="secondary">
          {trend}
        </Text>
      ) : null}
      {from ? (
        <Text variant="micro" tone="secondary">
          {from}
        </Text>
      ) : null}
      <Text variant="micro" tone="secondary">
        {recorded}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: radius.md,
    padding: spacing.sm + spacing.xs,
    gap: 2,
  },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
