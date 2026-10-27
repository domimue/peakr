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

export type MissingReason =
  /** No Garmin connection and no phone health store. */
  | 'not_connected'
  /** Garmin OAuth: the permission for this group was not granted on Garmin's consent screen. */
  | 'not_permitted'
  /** The user has not switched this data group on. */
  | 'not_enabled'
  /** The connected sources do not deliver this metric (API tier, no record type). */
  | 'not_provided'
  /** Permitted and delivered, but nothing in the metric's window (see `MetricMeta.why`). */
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
  | {
      kind: 'missing';
      metric: HealthMetric;
      reason: MissingReason;
      /**
       * The latest value outside the window, from whichever source has one – shown with its
       * source and day instead of claiming nothing was ever recorded.
       */
      last: DailyValue | null;
      /** Garmin is connected but does not deliver this metric on this kind of access. */
      garminLacks: boolean;
    };

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

/** Why there is no current value: the first of the four cases that applies. */
function missingReason(metric: HealthMetric, sources: Sources): MissingReason {
  const { group } = METRIC_META[metric];
  const connection = sources.status?.connection;
  const garmin = connection?.provides.includes(metric) ?? false;
  const device = sources.deviceProvides.includes(metric);
  // Garmin would deliver it, but the user did not grant that permission at Garmin.
  const permitted = sources.status?.permitted;
  if (garmin && !device && permitted && !permitted.includes(group)) return 'not_permitted';
  if (!sources.groups.includes(group)) return 'not_enabled';
  return garmin || device ? 'no_data' : 'not_provided';
}

export function metricState(
  metric: HealthMetric,
  values: readonly DailyValue[],
  sources: Sources,
  today: string,
): MetricState {
  const own = values.filter((v) => v.metric === metric && v.day <= today);
  const latest = own.at(-1);
  const recent =
    latest && daysBetween(latest.day, today) < METRIC_META[metric].recentDays ? latest : null;
  if (!recent) {
    const connection = sources.status?.connection;
    const garminLacks = !!connection && !connection.provides.includes(metric);
    if (!isConnected(sources)) {
      return { kind: 'missing', metric, reason: 'not_connected', last: null, garminLacks };
    }
    return {
      kind: 'missing',
      metric,
      reason: missingReason(metric, sources),
      last: latest ?? null,
      garminLacks,
    };
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
