/**
 * Body and recovery data (CLAUDE.md "Health"). Daily values per metric from the watch provider
 * (Garmin) and the phone's health store (Health Connect / HealthKit). The engine only describes
 * how a value compares to the user's **own** history – never a population norm, never a diagnosis.
 */

/** Numeric daily metrics. Only metrics a source actually delivers are ever stored. */
export const HEALTH_METRICS = [
  'sleep_duration',
  'sleep_score',
  'hrv_night',
  'resting_hr',
  'stress_avg',
  'steps',
  'floors',
  'intensity_min',
  'active_kcal',
  'spo2_avg',
  'respiration_avg',
  'weight',
  'body_fat',
  'muscle_mass',
  'bmi',
  'vo2max',
  'body_battery_high',
  'body_battery_low',
  'fitness_age',
] as const;

export type HealthMetric = (typeof HEALTH_METRICS)[number];

/** Opt-in groups (CLAUDE.md "Health → Consent and privacy"). Women's health is off by default. */
export const HEALTH_GROUPS = [
  'sleep',
  'hrv_rhr',
  'stress',
  'activity',
  'spo2_resp',
  'body_comp',
  'womens_health',
] as const;

export type HealthGroup = (typeof HEALTH_GROUPS)[number];

export const METRIC_GROUP: Record<HealthMetric, HealthGroup> = {
  sleep_duration: 'sleep',
  sleep_score: 'sleep',
  hrv_night: 'hrv_rhr',
  resting_hr: 'hrv_rhr',
  stress_avg: 'stress',
  body_battery_high: 'stress',
  body_battery_low: 'stress',
  steps: 'activity',
  floors: 'activity',
  intensity_min: 'activity',
  active_kcal: 'activity',
  vo2max: 'activity',
  fitness_age: 'activity',
  spo2_avg: 'spo2_resp',
  respiration_avg: 'spo2_resp',
  weight: 'body_comp',
  body_fat: 'body_comp',
  muscle_mass: 'body_comp',
  bmi: 'body_comp',
};

export function metricsOfGroup(group: HealthGroup): HealthMetric[] {
  return HEALTH_METRICS.filter((m) => METRIC_GROUP[m] === group);
}

export type HealthSource = 'garmin' | 'healthConnect' | 'healthKit';

/** One value as a source delivered it. */
export interface HealthRecord {
  metric: HealthMetric;
  /** Calendar day the value belongs to (`YYYY-MM-DD`; for sleep and HRV the morning of waking). */
  day: string;
  value: number;
  source: HealthSource;
  /** The record's id at the source (summary id, Health Connect record id …). */
  sourceId: string;
  /** When the source recorded the value (ISO date-time), shown next to every number. */
  recordedAt: string;
  /** Extra structure for detail views, e.g. sleep stages and bed/wake time. */
  detail?: Record<string, unknown> | null;
}

/** The one value per metric and day after deduplication across sources. */
export interface DailyValue {
  metric: HealthMetric;
  day: string;
  value: number;
  source: HealthSource;
  recordedAt: string;
  detail: Record<string, unknown> | null;
  /** Every source that delivered this metric for the day, kept for traceability. */
  sourceIds: { source: HealthSource; id: string }[];
}

export interface SeriesPoint {
  day: string;
  value: number;
}
