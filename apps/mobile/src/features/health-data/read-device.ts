import type { HealthGroup } from '@peakr/engine';

/**
 * Reads the enabled groups from the phone's health store (Health Connect / HealthKit) into the
 * local health table. Filled in with the Health Connect reader (Phase 9d step 6).
 */
export async function readDeviceHealth(_groups: readonly HealthGroup[]): Promise<number> {
  return 0;
}
