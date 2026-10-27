import type { DailyValue, HealthMetric } from '@peakr/engine';
import type { TFunction } from 'i18next';

import type { HealthSyncInfo } from '@/features/health-data/api';

import { daysBetween, type MetricState } from './model';
import { formatMetric, METRIC_META } from './metrics';

/** Texts shared by the overview tiles and the detail screens. */

export function timeOf(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

export function dayLabel(t: TFunction, day: string, ageDays: number, language: string): string {
  if (ageDays === 0) return t('health.overview.today');
  if (ageDays === 1) return t('health.overview.yesterday');
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/** "Garmin · 07:12" for today, "Health Connect · Yesterday, 23:40" otherwise. */
export function recordedLine(
  t: TFunction,
  value: DailyValue,
  ageDays: number,
  language: string,
): string {
  const source = t(`health.sources.${value.source}`);
  const time = timeOf(value.recordedAt, language);
  return ageDays === 0
    ? t('health.overview.recorded', { source, time })
    : t('health.overview.recordedDay', {
        source,
        day: dayLabel(t, value.day, ageDays, language),
        time,
      });
}

/** "Within / above / well below your usual range", or how many days the baseline still needs. */
export function baselineLine(t: TFunction, state: Extract<MetricState, { kind: 'value' }>): string {
  const { baseline, deviation } = state;
  if (baseline.status !== 'ok') {
    return t('health.baseline.building', { needed: baseline.needed, count: baseline.n });
  }
  if (!deviation) return t('health.baseline.within');
  if (deviation.level === 'within') return t('health.baseline.within');
  const clearly = deviation.level === 'clearly_off';
  if (deviation.direction === 'above') {
    return clearly ? t('health.baseline.wellAbove') : t('health.baseline.above');
  }
  return clearly ? t('health.baseline.wellBelow') : t('health.baseline.below');
}

export function trendLine(
  t: TFunction,
  state: Extract<MetricState, { kind: 'value' }>,
): string | null {
  if (state.trend.status !== 'ok') return null;
  return t(
    state.trend.direction === 'up'
      ? 'health.baseline.trendUp'
      : state.trend.direction === 'down'
        ? 'health.baseline.trendDown'
        : 'health.baseline.trendFlat',
  );
}

export function rangeLine(
  t: TFunction,
  metric: HealthMetric,
  state: Extract<MetricState, { kind: 'value' }>,
  language: string,
): string | null {
  if (state.baseline.status !== 'ok') return null;
  return t('health.baseline.range', {
    low: formatMetric(t, metric, Math.max(0, state.baseline.low), language),
    high: formatMetric(t, metric, state.baseline.high, language),
  });
}

type Missing = Extract<MetricState, { kind: 'missing' }>;

/**
 * Why a metric has no current value – the case that applies to this metric, not one sentence for
 * all of them – and its latest older value with day and source, if any source has one.
 */
export function missingLines(
  t: TFunction,
  state: Missing,
  sync: HealthSyncInfo | null | undefined,
  language: string,
  today: string,
): { reason: string; last: string | null } {
  const { recentDays, why } = METRIC_META[state.metric];
  let reason: string;
  switch (state.reason) {
    case 'not_enabled':
      reason = t('health.missing.not_enabled_tile');
      break;
    case 'not_provided':
      reason = state.garminLacks
        ? t('health.missing.not_provided_garmin')
        : t('health.missing.not_provided');
      break;
    case 'no_data':
      reason =
        sync?.lastError && !state.garminLacks
          ? t('health.missing.syncFailed')
          : t(`health.missing.why.${why}`, { days: recentDays });
      break;
    default:
      reason = t(`health.missing.${state.reason}`);
  }
  const last = state.last
    ? t('health.missing.last', {
        value: formatMetric(t, state.metric, state.last.value, language),
        day: dayLabel(t, state.last.day, daysBetween(state.last.day, today), language),
        source: t(`health.sources.${state.last.source}`),
      })
    : null;
  return { reason, last };
}

/** "Garmin estimate from Morning run" for Garmin's per-activity VO2max. */
export function vo2maxLine(t: TFunction, value: DailyValue): string | null {
  if (value.metric !== 'vo2max' || value.source !== 'garmin') return null;
  const name = value.detail?.activityName;
  return typeof name === 'string' && name.length > 0
    ? t('health.overview.vo2maxFrom', { activity: name })
    : null;
}
