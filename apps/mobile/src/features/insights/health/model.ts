import {
  computeBaseline,
  computeTrend,
  deviationFrom,
  type Baseline,
  type DailyValue,
  type Deviation,
  type HealthGroup,
  type HealthMetric,
  type SeriesPoint,
  type Trend,
} from '@peakr/engine';

import type { HealthStatus } from '@/features/health-data/api';

import { METRIC_META } from './metrics';

/**
 * View model of Insights → Health: per metric either today's (or the latest recent) value with
 * the user's own baseline, or the concrete reason why there is nothing to show. Pure, so the
 * screens stay thin and this is tested on its own.
 */

/** A value older than this is "no recent data", not today's value. */
export const RECENT_DAYS = 7;

export type MissingReason =
  /** No Garmin connection and no phone health store. */
  | 'not_connected'
  /** The user has not switched this data group on. */
  | 'not_enabled'
  /** The connected sources do not deliver this metric. */
  | 'not_provided'
  /** Nothing recorded recently (watch not worn, not synced yet). */
  | 'no_data';

export type MetricState =
  | {
      kind: 'value';
      metric: HealthMetric;
      latest: DailyValue;
      /** Days between the value and today (0 = today). */
      ageDays: number;
      baseline: Baseline;
      deviation: Deviation | null;
      trend: Trend;
    }
  | { kind: 'missing'; metric: HealthMetric; reason: MissingReason };

export interface Sources {
  status: HealthStatus | null | undefined;
  /** Metrics the phone's health store can deliver (Health Connect read permission granted). */
  deviceProvides: readonly HealthMetric[];
  /** Enabled groups (server answer, or the offline copy). */
  groups: readonly HealthGroup[];
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function seriesOf(values: readonly DailyValue[], metric: HealthMetric): SeriesPoint[] {
  return values.filter((v) => v.metric === metric).map((v) => ({ day: v.day, value: v.value }));
}

export function isConnected(sources: Sources): boolean {
  return !!sources.status?.connection || sources.deviceProvides.length > 0;
}

export function metricState(
  metric: HealthMetric,
  values: readonly DailyValue[],
  sources: Sources,
  today: string,
): MetricState {
  const own = values.filter((v) => v.metric === metric && v.day <= today);
  const latest = own.at(-1);
  const recent = latest && daysBetween(latest.day, today) < RECENT_DAYS ? latest : null;
  if (!recent) {
    if (!isConnected(sources)) return { kind: 'missing', metric, reason: 'not_connected' };
    if (!sources.groups.includes(METRIC_META[metric].group)) {
      return { kind: 'missing', metric, reason: 'not_enabled' };
    }
    const provided =
      (sources.status?.connection?.provides ?? []).includes(metric) ||
      sources.deviceProvides.includes(metric);
    return { kind: 'missing', metric, reason: provided ? 'no_data' : 'not_provided' };
  }
  const series = seriesOf(own, metric);
  const baseline = computeBaseline(metric, series, recent.day, 30);
  return {
    kind: 'value',
    metric,
    latest: recent,
    ageDays: daysBetween(recent.day, today),
    baseline,
    deviation: baseline.status === 'ok' ? deviationFrom(recent.value, baseline) : null,
    trend: computeTrend(metric, series, recent.day),
  };
}

/** The 7-day, 30-day and 12-month windows of the detail charts. */
export const PERIODS = { week: 7, month: 30, year: 365 } as const;
export type ChartPeriod = keyof typeof PERIODS;

export function periodStart(today: string, period: ChartPeriod): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - PERIODS[period] + 1);
  return d.toISOString().slice(0, 10);
}
