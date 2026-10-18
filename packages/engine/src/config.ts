/**
 * All tunable numbers of the zone calculators in one place.
 * Changing a value here changes the engine behaviour – keep the tests in sync.
 */
export const zoneConfig = {
  hr: {
    /** HRmax estimate: intercept − slope × age (CLAUDE.md: 208 − 0.7 × age). */
    hrMaxEstimate: { intercept: 208, slope: 0.7 },
    limits: {
      age: { min: 10, max: 100 },
      hrMax: { min: 100, max: 230 },
      restingHr: { min: 25, max: 120 },
      lthr: { min: 90, max: 220 },
    },
    /**
     * Zone boundaries as fractions, Z1 lower … Z5 upper (6 values).
     * %HRmax and Karvonen use the classic 50/60/70/80/90/100 % split.
     * LTHR uses Joe Friel's running zones (Z1 < 85 %, Z5 ≥ 100 %); open ends are null.
     */
    boundaries: {
      percentMax: [0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
      karvonen: [0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
      lthr: [null, 0.85, 0.9, 0.95, 1.0, null],
    },
  },
  run: {
    /** Riegel endurance exponent: T2 = T1 × (D2 / D1)^exponent. */
    riegelExponent: 1.06,
    /** Realistic race pace window in seconds per km (≈ world record … brisk walk). */
    paceLimitsSecPerKm: { min: 150, max: 900 },
    /** Threshold pace = predicted pace for a race lasting this long. */
    thresholdDurationSec: 3600,
    /** Pace zone boundaries as fraction of threshold pace, slow → fast (Friel run pace zones). */
    paceZoneBoundaries: [1.29, 1.14, 1.06, 0.99],
  },
  swim: {
    limits: {
      time200Sec: { min: 100, max: 600 },
      time400Sec: { min: 210, max: 1260 },
    },
    /** A 400 m time more than this multiple of the 200 m time points to a test error. */
    maxRatio400To200: 2.5,
    /** Pace zone boundaries as seconds per 100 m relative to CSS pace, slow → fast. */
    paceZoneOffsetsSecPer100m: [15, 8, 3, -2],
  },
} as const;
