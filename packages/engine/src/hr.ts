/**
 * Estimated maximum heart rate (Tanaka-style formula used by Peakr): 208 − 0.7 × age.
 * Only used when the user does not know their real HRmax – always show it as an estimate.
 */
export function estimateHrMax(age: number): number {
  if (!Number.isFinite(age) || age <= 0) {
    throw new RangeError(`age must be a positive number, got ${age}`);
  }
  return Math.round(208 - 0.7 * age);
}
