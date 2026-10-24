import type { DailyValue, HealthMetric } from '@peakr/engine';
import type { TFunction } from 'i18next';

import type { MetricState } from './model';
import { formatMetric } from './metrics';

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
