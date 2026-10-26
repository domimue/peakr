/**
 * Health data model shared by the Edge Functions and the app (CLAUDE.md "Health"). Pure TypeScript
 * without Deno or engine imports, so the same file runs in Deno and in Node (`packages/health`).
 * The metric and group names must match `@peakr/engine` (`health/types.ts`); a test checks it.
 */

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
  'resting_kcal',
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
  resting_kcal: 'activity',
  vo2max: 'activity',
  fitness_age: 'activity',
  spo2_avg: 'spo2_resp',
  respiration_avg: 'spo2_resp',
  weight: 'body_comp',
  body_fat: 'body_comp',
  muscle_mass: 'body_comp',
  bmi: 'body_comp',
};

export function isHealthGroup(value: unknown): value is HealthGroup {
  return typeof value === 'string' && (HEALTH_GROUPS as readonly string[]).includes(value);
}

/** One value as Garmin delivered it. `detail` carries structure for the detail views. */
export interface GarminHealthRecord {
  metric: HealthMetric;
  day: string;
  value: number;
  sourceId: string;
  recordedAt: string;
  detail?: Record<string, unknown> | null;
}

/** Keeps only the records of groups the user switched on. */
export function onlyEnabled(
  records: readonly GarminHealthRecord[],
  enabled: ReadonlySet<HealthGroup>,
): GarminHealthRecord[] {
  return records.filter((r) => enabled.has(METRIC_GROUP[r.metric]));
}

export type CredentialMode = 'oauth' | 'personal_key';

/**
 * How data reaches Peakr for a connection. The OAuth tier pushes (no history before the
 * connection, per the Starter terms as far as public sources say); the personal key is pulled.
 */
export interface HealthDelivery {
  mode: CredentialMode;
  delivery: 'push' | 'pull';
  /** Days of history Peakr tries to fetch on connect (0 = none available). */
  backfillDays: number;
  /**
   * Metrics Peakr reads from this kind of connection – the rest are "not provided" in the app
   * instead of an empty chart. Personal API: no VO2max or fitness-age summary is read (not in the
   * endpoints Peakr calls). Health API push: Body Battery is not part of the summaries mapped.
   */
  provides: readonly HealthMetric[];
}

export const DELIVERY: Record<CredentialMode, HealthDelivery> = {
  oauth: {
    mode: 'oauth',
    delivery: 'push',
    backfillDays: 0,
    provides: HEALTH_METRICS.filter((m) => m !== 'body_battery_high' && m !== 'body_battery_low'),
  },
  personal_key: {
    mode: 'personal_key',
    delivery: 'pull',
    backfillDays: 365,
    provides: HEALTH_METRICS.filter((m) => m !== 'vo2max' && m !== 'fitness_age'),
  },
};
