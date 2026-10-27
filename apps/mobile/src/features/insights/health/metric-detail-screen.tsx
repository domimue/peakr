import {
  allWorkouts,
  baselineBand,
  statusOf,
  type DailyValue,
  type HealthMetric,
  type Workout,
} from '@peakr/engine';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import type { HealthSyncInfo } from '@/features/health-data/api';
import { useHealthStatus, useHealthValues } from '@/features/health-data/queries';
import { useDeviceHealth } from '@/features/health-data/read-device';
import { formatDate } from '@/features/plan/calendar';
import { calendarTitle, typeColor } from '@/features/plan/kind';
import { usePlan } from '@/features/plan/queries';
import {
  Button,
  Card,
  ListState,
  numeric,
  radius,
  Screen,
  SegmentedControl,
  spacing,
  Text,
  useTheme,
  type ThemeColors,
} from '@/ui';

import {
  baselineLine,
  missingLines,
  rangeLine,
  recordedLine,
  trendLine,
  vo2maxLine,
} from './format';
import { HealthChart, type ChartDay, type ChartMarker } from './health-chart';
import { formatMetric, formatMinutes, isHealthMetric, metricLabel } from './metrics';
import {
  daysBetween,
  metricState,
  periodStart,
  seriesOf,
  type ChartPeriod,
  type MetricState,
} from './model';

/** Metrics whose charts show the hard sessions behind them (CLAUDE.md "Health"). */
const TRAINING_MARKED: readonly HealthMetric[] = ['resting_hr', 'hrv_night', 'sleep_duration'];
const BODY_EXTRA: readonly HealthMetric[] = ['body_fat', 'muscle_mass', 'bmi'];
const VALUE_ROWS = 14;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every day of the period with its value (if any) and the baseline band of that day. */
export function chartDays(
  metric: HealthMetric,
  values: readonly DailyValue[],
  from: string,
  to: string,
): ChartDay[] {
  const series = seriesOf(values, metric);
  const byDay = new Map(series.map((p) => [p.day, p.value]));
  const band = new Map(baselineBand(metric, series, from, to).map((b) => [b.day, b]));
  const out: ChartDay[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const b = band.get(day);
    out.push({ day, value: byDay.get(day) ?? null, low: b?.low ?? null, high: b?.high ?? null });
  }
  return out;
}

/** Completed hard sessions of the plan in the period (intervals, long, hilly, heavy legs …). */
export function hardSessions(
  stored: ReturnType<typeof usePlan>['data'],
  from: string,
  to: string,
): Workout[] {
  if (!stored) return [];
  return allWorkouts(stored.state.plan)
    .filter((w) => w.hard && w.date >= from && w.date <= to)
    .filter((w) => statusOf(stored.state, w.id) === 'done')
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function MetricDetailScreen() {
  const { t, i18n } = useTranslation();
  const { metric: param } = useLocalSearchParams<{ metric: string }>();
  const metric = isHealthMetric(param) ? param : null;
  return (
    <>
      <Stack.Screen options={{ title: metric ? metricLabel(t, metric) : '' }} />
      {metric ? (
        <MetricDetail metric={metric} language={i18n.language} />
      ) : (
        <Screen>
          <ListState kind="error" title={t('common.loadError')} />
        </Screen>
      )}
    </>
  );
}

function MetricDetail({ metric, language }: { metric: HealthMetric; language: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const today = todayIso();
  const [period, setPeriod] = useState<ChartPeriod>('month');
  const from = periodStart(today, period);
  // The band of the first days needs the 30 days before the period as well.
  const { data: values = [] } = useHealthValues(
    metric === 'weight' ? [metric, ...BODY_EXTRA] : [metric],
    addDays(periodStart(today, 'year'), -30),
  );
  const { data: status } = useHealthStatus();
  const device = useDeviceHealth();
  const { data: stored } = usePlan();
  const sources = {
    status,
    deviceProvides: device.provides,
    groups: status?.groups ?? device.groups,
  };
  const state = metricState(metric, values, sources, today);
  const days = useMemo(() => chartDays(metric, values, from, today), [metric, values, from, today]);
  const hard = TRAINING_MARKED.includes(metric) ? hardSessions(stored, from, today) : [];
  const markers: ChartMarker[] = hard.map((w) => ({ day: w.date, color: typeColor(colors, w) }));
  const inPeriod = values
    .filter((v) => v.metric === metric && v.day >= from && v.day <= today)
    .reverse();

  return (
    <Screen>
      <Summary
        metric={metric}
        state={state}
        sync={status?.sync}
        today={today}
        language={language}
      />

      {metric === 'sleep_duration' ? (
        <SleepNight values={values} today={today} language={language} />
      ) : null}

      <SegmentedControl
        options={(['week', 'month', 'year'] as const).map((p) => ({
          value: p,
          label: t(`health.detail.periods.${p}`),
        }))}
        value={period}
        onChange={setPeriod}
      />
      <Card>
        {inPeriod.length === 0 ? (
          <ListState kind="empty" icon="heart" title={t('health.detail.noValues')} />
        ) : (
          <HealthChart
            days={days}
            markers={markers}
            accessibilityLabel={t('health.detail.chartA11y', {
              metric: metricLabel(t, metric),
              period: t(`health.detail.periods.${period}`),
              count: inPeriod.length,
              latest: formatMetric(t, metric, inPeriod[0]?.value ?? 0, language),
            })}
          />
        )}
      </Card>

      {metric === 'sleep_duration' ? <SleepWeek values={values} today={today} /> : null}

      {TRAINING_MARKED.includes(metric) ? (
        <HardSessions workouts={hard} colors={colors} language={language} />
      ) : null}

      {metric === 'weight' ? <BodyComposition values={values} language={language} /> : null}

      <Text variant="heading">{t('health.detail.values')}</Text>
      <Card testID="health-values">
        {inPeriod.length === 0 ? (
          <Text tone="secondary">{t('health.detail.noValues')}</Text>
        ) : (
          inPeriod.slice(0, VALUE_ROWS).map((v) => (
            <View key={v.day} style={styles.row}>
              <Text style={[styles.flex, numeric]}>
                {formatMetric(t, metric, v.value, language)}
              </Text>
              <Text variant="caption" tone="secondary">
                {recordedLine(t, v, daysBetween(v.day, today), language)}
              </Text>
            </View>
          ))
        )}
      </Card>
      <Text variant="caption" tone="secondary">
        {t(`health.metrics.${metric}.about`)}
      </Text>
      <Text variant="caption" tone="secondary">
        {t('health.baseline.ownHistory')}
      </Text>
    </Screen>
  );
}

function Summary({
  metric,
  state,
  sync,
  today,
  language,
}: {
  metric: HealthMetric;
  state: MetricState;
  sync: HealthSyncInfo | undefined;
  today: string;
  language: string;
}) {
  const { t } = useTranslation();
  if (state.kind === 'missing') {
    const { reason, last } = missingLines(t, state, sync, language, today);
    return (
      <Card testID="health-detail-missing">
        <Text tone="secondary">{reason}</Text>
        {last ? (
          <Text variant="caption" tone="secondary" style={numeric}>
            {last}
          </Text>
        ) : null}
        {state.reason === 'not_enabled' ? (
          <Button
            variant="secondary"
            small
            label={t('health.missing.turnOn')}
            onPress={() => router.push('/health/consent')}
          />
        ) : null}
      </Card>
    );
  }
  const from = vo2maxLine(t, state.latest);
  const range = rangeLine(t, metric, state, language);
  const trend = trendLine(t, state);
  return (
    <Card testID="health-detail-summary">
      <Text variant="display" style={numeric}>
        {formatMetric(t, metric, state.latest.value, language)}
      </Text>
      <Text>{baselineLine(t, state)}</Text>
      {range ? (
        <Text variant="caption" tone="secondary" style={numeric}>
          {range}
        </Text>
      ) : null}
      {trend ? (
        <Text variant="caption" tone="secondary">
          {trend}
        </Text>
      ) : null}
      {from ? (
        <Text variant="caption" tone="secondary">
          {from}
        </Text>
      ) : null}
      <Text variant="caption" tone="secondary">
        {recordedLine(t, state.latest, state.ageDays, language)}
      </Text>
      {state.deviation?.level === 'clearly_off' ? (
        <Text variant="caption" tone="secondary" testID="health-consult">
          {t('health.detail.consult')}
        </Text>
      ) : null}
    </Card>
  );
}

const STAGES = ['deep', 'light', 'rem', 'awake'] as const;
type Stage = (typeof STAGES)[number];
const STAGE_TOKEN: Record<Stage, 'sleepDeep' | 'sleepLight' | 'sleepRem' | 'sleepAwake'> = {
  deep: 'sleepDeep',
  light: 'sleepLight',
  rem: 'sleepRem',
  awake: 'sleepAwake',
};

function stageMinutes(v: DailyValue | undefined): Record<Stage, number | null> {
  const d = v?.detail ?? {};
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : null);
  return { deep: n('deepMin'), light: n('lightMin'), rem: n('remMin'), awake: n('awakeMin') };
}

function SleepNight({
  values,
  today,
  language,
}: {
  values: readonly DailyValue[];
  today: string;
  language: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const nights = values.filter((v) => v.metric === 'sleep_duration' && v.day <= today);
  const last = nights.at(-1);
  if (!last) return null;
  const stages = stageMinutes(last);
  const total = STAGES.reduce((s, k) => s + (stages[k] ?? 0), 0);
  const bed = typeof last.detail?.bedTime === 'string' ? last.detail.bedTime : null;
  const wake = typeof last.detail?.wakeTime === 'string' ? last.detail.wakeTime : null;
  return (
    <Card testID="sleep-night">
      <Text variant="label">
        {t('health.sleep.lastNight')} ·{' '}
        {formatDate(last.day, language, { weekday: 'short', day: 'numeric', month: 'short' })}
      </Text>
      {total > 0 ? (
        <>
          <View style={[styles.stages, { backgroundColor: colors.surface2 }]}>
            {STAGES.filter((k) => (stages[k] ?? 0) > 0).map((k) => (
              <View
                key={k}
                style={{ flex: stages[k] ?? 0, backgroundColor: colors[STAGE_TOKEN[k]] }}
              />
            ))}
          </View>
          <View style={styles.stageLegend}>
            {STAGES.map((k) =>
              stages[k] === null ? null : (
                <View key={k} style={styles.stageItem}>
                  <View style={[styles.swatch, { backgroundColor: colors[STAGE_TOKEN[k]] }]} />
                  <Text variant="caption" style={numeric}>
                    {t('health.sleep.stageValue', {
                      stage: t(`health.sleep.stages.${k}`),
                      minutes: formatMinutes(t, stages[k] ?? 0),
                    })}
                  </Text>
                </View>
              ),
            )}
          </View>
        </>
      ) : (
        <Text variant="caption" tone="secondary">
          {t('health.sleep.noStages')}
        </Text>
      )}
      {bed && wake ? (
        <Text variant="caption" tone="secondary" style={numeric}>
          {t('health.sleep.bedWake', { bed, wake })}
        </Text>
      ) : null}
    </Card>
  );
}

/** The last 7 nights as rows with a proportional bar – the week's pattern at a glance. */
function SleepWeek({ values, today }: { values: readonly DailyValue[]; today: string }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const from = addDays(today, -6);
  const nights = new Map(
    values.filter((v) => v.metric === 'sleep_duration' && v.day >= from).map((v) => [v.day, v]),
  );
  const max = Math.max(1, ...[...nights.values()].map((v) => v.value));
  const rows = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <>
      <Text variant="heading">{t('health.sleep.week')}</Text>
      <Card testID="sleep-week">
        {rows.map((day) => {
          const v = nights.get(day);
          const name = formatDate(day, i18n.language, { weekday: 'short' });
          const duration = v ? formatMinutes(t, v.value) : '–';
          return (
            <View
              key={day}
              style={styles.row}
              accessible
              accessibilityLabel={t('health.sleep.weekA11y', { day: name, duration })}
            >
              <Text variant="caption" style={styles.weekday}>
                {name}
              </Text>
              <View style={[styles.weekTrack, { backgroundColor: colors.surface2 }]}>
                {v ? (
                  <View
                    style={[
                      styles.weekBar,
                      { width: `${(v.value / max) * 100}%`, backgroundColor: colors.textMuted },
                    ]}
                  />
                ) : null}
              </View>
              <Text variant="caption" style={[styles.weekValue, numeric]}>
                {duration}
              </Text>
            </View>
          );
        })}
      </Card>
    </>
  );
}

function HardSessions({
  workouts,
  colors,
  language,
}: {
  workouts: readonly Workout[];
  colors: ThemeColors;
  language: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Text variant="heading">{t('health.detail.hardSessions')}</Text>
      <Card testID="hard-sessions">
        {workouts.length === 0 ? (
          <Text tone="secondary">{t('health.detail.noHardSessions')}</Text>
        ) : (
          <>
            {workouts.map((w) => (
              <View key={w.id} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: typeColor(colors, w) }]} />
                <Text style={styles.flex}>{calendarTitle(t, w)}</Text>
                <Text variant="caption" tone="secondary">
                  {formatDate(w.date, language, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
              </View>
            ))}
            <Text variant="caption" tone="secondary">
              {t('health.detail.hardSessionsHint')}
            </Text>
          </>
        )}
      </Card>
    </>
  );
}

function BodyComposition({
  values,
  language,
}: {
  values: readonly DailyValue[];
  language: string;
}) {
  const { t } = useTranslation();
  const latest = BODY_EXTRA.map((m) => values.filter((v) => v.metric === m).at(-1)).filter(
    (v): v is DailyValue => v !== undefined,
  );
  return (
    <>
      <Text variant="heading">{t('health.body.title')}</Text>
      <Card testID="body-composition">
        {latest.length === 0 ? (
          <Text tone="secondary">{t('health.body.none')}</Text>
        ) : (
          latest.map((v) => (
            <View key={v.metric} style={styles.row}>
              <Text tone="secondary" style={styles.flex}>
                {metricLabel(t, v.metric)}
              </Text>
              <Text style={numeric}>{formatMetric(t, v.metric, v.value, language)}</Text>
            </View>
          ))
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  stages: { flexDirection: 'row', height: 14, borderRadius: radius.sm, overflow: 'hidden' },
  stageLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stageItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  weekday: { width: 36 },
  weekTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  weekBar: { height: 8, borderRadius: 4 },
  weekValue: { width: 84, textAlign: 'right' },
});
