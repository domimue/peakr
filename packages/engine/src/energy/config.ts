/**
 * Every number of the energy model in one place (CLAUDE.md "Energy & body rules", "Weight goal
 * rules"). Changing a value changes the engine – keep the tests in sync.
 */
export const energyConfig = {
  /** Mifflin-St Jeor: 10 × kg + 6.25 × cm − 5 × age + offset. */
  mifflin: { kg: 10, cm: 6.25, age: 5, offset: { male: 5, female: -161 } },
  /** Katch-McArdle: 370 + 21.6 × lean mass (kg), used when body fat % is known. */
  katch: { intercept: 370, perLeanKg: 21.6 },
  /**
   * Everyday movement outside workouts on top of the resting energy (a sedentary multiplier):
   * workouts are counted separately, so this stays at the lowest activity level.
   */
  dailyLivingFactor: 1.2,
  /** Share of device-reported active energy that is counted (wearables overestimate). */
  deviceActiveShare: 0.75,
  /** Intake target never below max(BMR, this floor) – a safety rule, not a setting. */
  intakeFloorKcal: { female: 1200, male: 1500 },
  /**
   * MET per sport and intensity (Compendium of Physical Activities 2024, rounded). Strength uses
   * the RPE-based estimate of the Gym module.
   */
  met: {
    run: { recovery: 6, easy: 8, moderate: 9.8, hard: 11.5 },
    bike: { recovery: 4, easy: 6.8, moderate: 8, hard: 10 },
    swim: { recovery: 5, easy: 6, moderate: 8, hard: 9.5 },
    walk: { recovery: 3, easy: 3.5, moderate: 4.3, hard: 5 },
    xcski: { recovery: 6, easy: 7, moderate: 9, hard: 12 },
    skitour: { recovery: 6, easy: 7, moderate: 9, hard: 11 },
    snowshoe: { recovery: 5, easy: 6, moderate: 8, hard: 10 },
    /** Bike → run: between the two. */
    brick: { recovery: 5, easy: 7.4, moderate: 8.9, hard: 10.8 },
  },
  /** Body weight assumed for workout estimates when none is on file. */
  defaultBodyWeightKg: 75,
  /** Smoothing factor of the weight trend (exponential moving average, per weigh-in day). */
  trendAlpha: 0.1,
  limits: {
    weightKg: { min: 30, max: 300 },
    heightCm: { min: 120, max: 230 },
    age: { min: 13, max: 100 },
    bodyFatPct: { min: 3, max: 60 },
  },
} as const;

export type EnergyConfig = typeof energyConfig;
