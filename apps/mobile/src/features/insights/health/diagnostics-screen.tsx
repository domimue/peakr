import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { EndpointStat } from '@/features/health-data/api';
import { useHealthDiagnostics } from '@/features/health-data/queries';
import { Button, Card, ListState, numeric, Screen, spacing, Text } from '@/ui';

import { metricLabel } from './metrics';

/**
 * Developer diagnostics of the health sync: per Garmin endpoint the last call of the recent window
 * and of the backfill step (time, HTTP status, records, calls, error kind), the backfill state, and
 * how many days per metric each source has on this device. Counts and status codes only.
 */
export function HealthDiagnosticsScreen() {
  const { t, i18n } = useTranslation();
  const { data, isPending, refetch, isFetching } = useHealthDiagnostics();
  const when = (iso: string | null | undefined) =>
    iso
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'medium' }).format(
          new Date(iso),
        )
      : t('health.diagnostics.none');
  const list = (items: readonly string[]) =>
    items.length ? items.join(', ') : t('health.diagnostics.none');

  if (isPending) {
    return (
      <Screen>
        <ListState kind="loading" label={t('common.loading')} />
      </Screen>
    );
  }
  const server = data?.server ?? null;
  const local = data?.local ?? [];

  const call = (stat: EndpointStat | null) =>
    stat ? (
      <>
        <Text variant="caption" style={numeric}>
          {t('health.diagnostics.call', {
            time: when(stat.at),
            status: stat.status,
            records: stat.records,
            calls: stat.calls,
          })}
        </Text>
        {stat.error ? (
          <Text variant="caption" tone="danger">
            {t('health.diagnostics.callError', { error: stat.error })}
          </Text>
        ) : null}
      </>
    ) : (
      <Text variant="caption" tone="secondary">
        {t('health.diagnostics.never')}
      </Text>
    );

  return (
    <Screen>
      <Text variant="caption" tone="secondary">
        {t('health.diagnostics.intro')}
      </Text>
      <Button
        variant="secondary"
        small
        icon="reset"
        label={t('health.overview.syncNow')}
        disabled={isFetching}
        onPress={() => void refetch()}
      />

      {server ? (
        <>
          <Card testID="health-diagnostics-connection">
            <Text variant="label">{t('health.diagnostics.connection')}</Text>
            <Text variant="caption">
              {t('health.diagnostics.mode', { mode: server.mode ?? t('health.diagnostics.none') })}
            </Text>
            <Text variant="caption">
              {t('health.diagnostics.status', {
                status: server.status ?? t('health.diagnostics.none'),
              })}
            </Text>
            <Text variant="caption">
              {t('health.diagnostics.permissions', { list: list(server.permissions) })}
            </Text>
            <Text variant="caption">
              {t('health.diagnostics.groups', { list: list(server.groups) })}
            </Text>
            <Text variant="caption" style={numeric}>
              {t('health.diagnostics.parser', server.parserVersion)}
            </Text>
            <Text variant="caption">
              {t('health.diagnostics.backfill', {
                state: server.sync.backfillDone
                  ? t('health.diagnostics.backfillDone')
                  : t('health.diagnostics.backfillRunning'),
                before: server.sync.backfillBefore ?? t('health.diagnostics.none'),
              })}
            </Text>
            <Text variant="caption">
              {t('health.diagnostics.earliest', {
                day: server.sync.earliestDay ?? t('health.diagnostics.none'),
              })}
            </Text>
            <Text variant="caption">
              {t('health.diagnostics.lastPulled', { time: when(server.sync.lastPulledAt) })}
            </Text>
            {server.sync.lastError ? (
              <Text variant="caption" tone="danger">
                {t('health.diagnostics.lastError', { error: server.sync.lastError })}
              </Text>
            ) : null}
          </Card>

          <Text variant="label">{t('health.diagnostics.endpoints')}</Text>
          {server.endpoints.map((e) => (
            <Card key={e.endpoint} testID={`health-diagnostics-${e.endpoint}`}>
              <Text variant="label">{e.endpoint}</Text>
              <View style={styles.gap}>
                <Text variant="caption" tone="secondary">
                  {t('health.diagnostics.recent')}
                </Text>
                {call(e.recent)}
                <Text variant="caption" tone="secondary">
                  {t('health.diagnostics.backfillWindow')}
                </Text>
                {call(e.backfill)}
              </View>
            </Card>
          ))}
        </>
      ) : (
        <Text tone="danger">{t('health.diagnostics.unavailable')}</Text>
      )}

      <Text variant="label">{t('health.diagnostics.local')}</Text>
      <Card testID="health-diagnostics-local">
        {local.length === 0 ? (
          <Text variant="caption" tone="secondary">
            {t('health.diagnostics.localEmpty')}
          </Text>
        ) : (
          local.map((c) => (
            <Text key={`${c.metric}|${c.source}`} variant="caption" style={numeric}>
              {metricLabel(t, c.metric)} ·{' '}
              {t('health.diagnostics.localRow', {
                source: t(`health.sources.${c.source}`),
                count: c.count,
                day: c.latestDay,
              })}
            </Text>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.xs },
});
