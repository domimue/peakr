import type { HealthMetric, HealthSource } from './types';

/**
 * Tunable numbers of the health engine in one place. Changing a value changes behaviour – keep the
 * tests in sync.
 */
export const healthConfig = {
  /** Deduplication: lower index wins (CLAUDE.md "Health": Garmin > Health Connect). */
  sourcePriority: ['garmin', 'healthConnect', 'healthKit'] as readonly HealthSource[],
  baseline: {
    windows: [30, 90] as const,
    /** Fewer values than this in the window → "not enough data" instead of a band. */
    minValues: { 30: 14, 90: 30 },
    /** MAD → standard-deviation-like scale for normal data. */
    madScale: 1.4826,
    /** Normal band = median ± `bandZ` × scale. */
    bandZ: 1.5,
    /** Beyond median ± `clearlyZ` × scale a value is "clearly off". */
    clearlyZ: 2.5,
  },
  trend: {
    recentDays: 7,
    minRecentValues: 4,
    /** Recent median must differ from the 30-day median by more than this many scales to count as a trend. */
    thresholdZ: 1,
  },
  /**
   * Smallest scale per metric, so a very steady history (MAD ≈ 0) does not turn every normal
   * day-to-day wobble into "off". Units: bpm, ms, min, points, steps, kg, % …
   */
  minScale: {
    sleep_duration: 20,
    sleep_score: 4,
    hrv_night: 3,
    resting_hr: 1.5,
    stress_avg: 3,
    steps: 800,
    floors: 2,
    intensity_min: 8,
    active_kcal: 80,
    spo2_avg: 0.7,
    respiration_avg: 0.4,
    weight: 0.3,
    body_fat: 0.4,
    muscle_mass: 0.3,
    bmi: 0.1,
    vo2max: 0.5,
    body_battery_high: 5,
    body_battery_low: 5,
    fitness_age: 0.5,
  } satisfies Record<HealthMetric, number>,
  /** Metrics the recovery signal reads, with the direction that counts as "off" for recovery. */
  recovery: {
    resting_hr: 'above',
    hrv_night: 'below',
    sleep_duration: 'below',
  } as const,
} as const;

export type HealthConfig = typeof healthConfig;
