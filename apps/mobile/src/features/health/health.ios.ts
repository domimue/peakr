import type { HealthProvider } from './types';

/**
 * HealthKit (iOS) – prepared, not active. The interface is the same as on Android; the iOS release
 * adds the native part and replaces the body:
 *   - save an `HKWorkout` with `HKWorkoutActivityType.traditionalStrengthTraining`, start/end from
 *     the session, `totalEnergyBurned` from the estimate (kcal), and `HKMetadataKeySyncIdentifier`
 *     = `gymRecordId(sessionId)` (with a sync version) so a repeated write replaces the workout,
 *   - request share authorisation for `HKWorkoutType` and active energy only (no read access),
 *   - add `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription` and the HealthKit
 *     entitlement through the config plugin.
 *   - reading (Insights → Health): HKCategoryTypeIdentifier.sleepAnalysis, restingHeartRate,
 *     heartRateVariabilitySDNN (note: SDNN, not RMSSD – shown as its own source, never mixed into
 *     a Garmin baseline without a label), stepCount, flightsClimbed, oxygenSaturation,
 *     respiratoryRate, bodyMass, bodyFatPercentage, vo2Max, mapped with `device-map.ts`.
 * Until then writing reports "unsupported" and the switch in the app stays hidden.
 */
export const health: HealthProvider = {
  store: 'healthKit',
  isSupported: async () => false,
  hasWritePermission: async () => false,
  requestWritePermission: async () => false,
  writeStrengthWorkout: async () => ({ ok: false, reason: 'unsupported' }),
  readableMetrics: async () => [],
  requestReadPermission: async () => [],
  readDaily: async () => [],
  // Body add-on, same plan: HKQuantityTypeIdentifier bodyMass, bodyFatPercentage, stepCount,
  // activeEnergyBurned, basalEnergyBurned, dietaryEnergyConsumed and HKWorkout (with its
  // totalEnergyBurned), daily sums via HKStatisticsCollectionQuery, read authorisation only.
  bodyReadable: async () => [],
  requestBodyPermission: async () => [],
  readBody: async () => [],
};
