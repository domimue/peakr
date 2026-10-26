import type { HealthMetric } from '@peakr/engine';

import type { DeviceDailyValue } from './device-map';

/**
 * Health data behind one interface (CLAUDE.md "Platform strategy": platform code in
 * `.android.ts` / `.ios.ts`). Screens only import `./health`; Metro picks the platform file.
 */

export type HealthStore = 'healthConnect' | 'healthKit';

export interface StrengthWorkoutWrite {
  /** Peakr gym session id; the record is keyed on it, so writing twice updates one record. */
  sessionId: string;
  title: string;
  /** Epoch ms. */
  startedAt: number;
  endedAt: number;
  /** Estimated energy of the session (kcal); omitted when unknown. */
  kcal?: number;
  notes?: string;
}

export type WriteResult =
  | { ok: true; recordId: string | null }
  | { ok: false; reason: 'unsupported' | 'permission' | 'failed' };

/**
 * What the Body add-on reads from the phone's health store (CLAUDE.md "Health Connect /
 * HealthKit": only what is needed). Asked for separately from Insights → Health, and only while
 * the add-on is active.
 */
export const BODY_HEALTH_METRICS = [
  'weight',
  'body_fat',
  'steps',
  'active_kcal',
  'resting_kcal',
  'intake_kcal',
  'workout_kcal',
] as const;
export type BodyHealthMetric = (typeof BODY_HEALTH_METRICS)[number];

export interface BodyDeviceValue {
  metric: BodyHealthMetric;
  day: string;
  value: number;
  recordedAt: string;
}

export interface HealthProvider {
  /** Which store this is, for texts ("Health Connect" / "Apple Health"). */
  store: HealthStore;
  /** The platform has the store and it is usable (Health Connect installed and up to date). */
  isSupported(): Promise<boolean>;
  hasWritePermission(): Promise<boolean>;
  /** Shows the system permission sheet; resolves whether writing is now allowed. */
  requestWritePermission(): Promise<boolean>;
  /** Saves a finished gym session as a strength-training workout with duration and energy. */
  writeStrengthWorkout(workout: StrengthWorkoutWrite): Promise<WriteResult>;
  /** Of `metrics`, those the user allowed Peakr to read. */
  readableMetrics(metrics: readonly HealthMetric[]): Promise<HealthMetric[]>;
  /** Shows the system sheet for reading `metrics`; resolves the ones now allowed. */
  requestReadPermission(metrics: readonly HealthMetric[]): Promise<HealthMetric[]>;
  /** One value per metric and local day between `from` and `to` (allowed metrics only). */
  readDaily(metrics: readonly HealthMetric[], from: Date, to: Date): Promise<DeviceDailyValue[]>;
  /** Body add-on: the metrics Peakr may read. */
  bodyReadable(): Promise<BodyHealthMetric[]>;
  /** Body add-on: shows the system sheet for exactly the Body record types. */
  requestBodyPermission(): Promise<BodyHealthMetric[]>;
  /** Body add-on: one value per metric and local day (daily totals, latest measurement). */
  readBody(from: Date, to: Date): Promise<BodyDeviceValue[]>;
}
