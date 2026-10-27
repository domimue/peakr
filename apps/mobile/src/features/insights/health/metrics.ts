import { METRIC_GROUP, type HealthGroup, type HealthMetric } from '@peakr/engine';
import type { TFunction } from 'i18next';

/**
 * How each health metric is shown: label, unit and number format. Only describes what was
 * measured – no metric carries a "good" or "bad" judgement here (CLAUDE.md "Health → No
 * diagnosis").
 */

export interface MetricMeta {
  metric: HealthMetric;
  group: HealthGroup;
  /** Decimals shown. */
  decimals: number;
  /** Metric of a daily total (steps) rather than a level (resting HR). */
  total?: boolean;
  /**
   * How old the latest value may be to count as the current one. Most metrics are recorded every
   * day the watch is worn; weight only on the days someone steps on the scale, and Garmin's VO2max
   * only after a run or ride that updates it.
   */
  recentDays: number;
  /**
   * Why a value can be missing although everything is set up – the real reason for this metric
   * (`health.missing.why.<why>`).
   */
  why: MissingWhy;
}

export type MissingWhy =
  'overnight' | 'continuous' | 'spo2' | 'respiration' | 'scale' | 'vo2max' | 'fitnessAge';

/** Days a value counts as current, unless the metric says otherwise. */
export const DEFAULT_RECENT_DAYS = 7;

const WHY: Record<HealthMetric, MissingWhy> = {
  sleep_duration: 'overnight',
  sleep_score: 'overnight',
  hrv_night: 'overnight',
  resting_hr: 'continuous',
  stress_avg: 'continuous',
  body_battery_high: 'continuous',
  body_battery_low: 'continuous',
  steps: 'continuous',
  floors: 'continuous',
  intensity_min: 'continuous',
  active_kcal: 'continuous',
  resting_kcal: 'continuous',
  spo2_avg: 'spo2',
  respiration_avg: 'respiration',
  weight: 'scale',
  body_fat: 'scale',
  muscle_mass: 'scale',
  bmi: 'scale',
  vo2max: 'vo2max',
  fitness_age: 'fitnessAge',
};

const RECENT_DAYS: Partial<Record<HealthMetric, number>> = {
  weight: 30,
  body_fat: 30,
  muscle_mass: 30,
  bmi: 30,
  vo2max: 30,
};

const meta = (metric: HealthMetric, decimals = 0, total = false): MetricMeta => ({
  metric,
  group: METRIC_GROUP[metric],
  decimals,
  total,
  recentDays: RECENT_DAYS[metric] ?? DEFAULT_RECENT_DAYS,
  why: WHY[metric],
});

/** Overview tiles, in this order. */
export const OVERVIEW_METRICS: readonly MetricMeta[] = [
  meta('sleep_duration'),
  meta('hrv_night'),
  meta('resting_hr'),
  meta('stress_avg'),
  meta('body_battery_high'),
  meta('steps', 0, true),
  meta('intensity_min', 0, true),
  meta('spo2_avg'),
  meta('respiration_avg', 1),
  meta('weight', 1),
  meta('vo2max'),
];

export const METRIC_META: Record<HealthMetric, MetricMeta> = {
  sleep_duration: meta('sleep_duration'),
  sleep_score: meta('sleep_score'),
  hrv_night: meta('hrv_night'),
  resting_hr: meta('resting_hr'),
  stress_avg: meta('stress_avg'),
  steps: meta('steps', 0, true),
  floors: meta('floors', 0, true),
  intensity_min: meta('intensity_min', 0, true),
  active_kcal: meta('active_kcal', 0, true),
  resting_kcal: meta('resting_kcal', 0, true),
  spo2_avg: meta('spo2_avg'),
  respiration_avg: meta('respiration_avg', 1),
  weight: meta('weight', 1),
  body_fat: meta('body_fat', 1),
  muscle_mass: meta('muscle_mass', 1),
  bmi: meta('bmi', 1),
  vo2max: meta('vo2max'),
  body_battery_high: meta('body_battery_high'),
  body_battery_low: meta('body_battery_low'),
  fitness_age: meta('fitness_age'),
};

export function isHealthMetric(v: unknown): v is HealthMetric {
  return typeof v === 'string' && v in METRIC_META;
}

export function metricLabel(t: TFunction, metric: HealthMetric): string {
  return t(`health.metrics.${metric}.label`);
}

/** "7 h 30 min" for sleep, otherwise the number with its unit ("48 bpm", "11,234 steps"). */
export function formatMetric(
  t: TFunction,
  metric: HealthMetric,
  value: number,
  language: string,
): string {
  if (metric === 'sleep_duration') return formatMinutes(t, value);
  const { decimals } = METRIC_META[metric];
  const number = new Intl.NumberFormat(language, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return t(`health.metrics.${metric}.value`, { value: number });
}

export function formatMinutes(t: TFunction, minutes: number): string {
  const rounded = Math.round(minutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return h > 0 ? t('health.hoursMinutes', { h, m }) : t('health.minutes', { count: m });
}

/** The difference to the baseline in the metric's unit, without a sign ("6 bpm", "35 min"). */
export function formatAmount(
  t: TFunction,
  metric: HealthMetric,
  amount: number,
  language: string,
): string {
  return formatMetric(t, metric, Math.abs(amount), language);
}
