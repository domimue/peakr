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
  /**
   * Correction factor for device-reported active energy (wearables overestimate): this share is
   * counted. Configurable per call; the default applies when the user has not changed it.
   */
  deviceActiveShare: 0.8,
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
  /** Katch-McArdle needs a body fat % measured within this many days. */
  bodyFatMaxAgeDays: 30,
  /** Energy of one step per kg body weight (≈ 0.04 kcal per step at 70 kg). */
  kcalPerStepPerKg: 0.00057,
  /** Steps per minute counted inside run / walk workouts (not everyday movement). */
  workoutStepsPerMin: { run: 160, walk: 110 },
  /** Keytel et al. (2005): energy from heart rate, kcal/min = (a + b·HR + c·kg + d·age) / 4.184. */
  keytel: {
    male: { a: -55.0969, hr: 0.6309, kg: 0.1988, age: 0.2017 },
    female: { a: -20.4022, hr: 0.4472, kg: -0.1263, age: 0.074 },
    /** Heart rates outside this range are not used (sensor errors). */
    hrRange: { min: 80, max: 210 },
  },
  /** Energy of one kg body fat (estimate, shown as one). */
  kcalPerKgFat: 7700,
  trend: {
    /** Smoothing factor of the weight trend (exponentially weighted, per day). */
    alpha: 0.1,
    /** A weigh-in moves the trend by at most this share of the trend weight (water swings). */
    maxResidualShare: 0.02,
    /** Farther than this from the trend a weigh-in is flagged as an outlier. */
    outlierShare: 0.03,
  },
  adaptive: {
    /** Days with weight and logged intake needed before an estimate is made. */
    minDays: 14,
    /** Days looked back. */
    windowDays: 28,
    /** The estimate moves at most this much per week from the previous one. */
    maxChangePerWeekKcal: 100,
    /** Never further than this share from the formula estimate (data error guard). */
    maxShareFromFormula: 0.3,
  },
  scale: {
    /** Trend points (weigh-in days) a week needs to be compared. */
    minWeighInsPerWeek: 3,
    /** Weeks for medium / high confidence. */
    mediumWeeks: 2,
    highWeeks: 4,
  },
  goal: {
    /** Max loss per week: this share of the body weight, and never more than `maxLossKg`. */
    maxLossShare: 0.01,
    maxLossKgPerWeek: 1.0,
    /** No loss goal below this BMI (current or target). */
    minBmi: 18.5,
    /** Below this age only "maintain". */
    minAgeForChange: 18,
    /** Protein during weight loss, g per kg body weight. */
    proteinGPerKg: { min: 1.6, max: 2.2 },
    /** Gain is capped like loss, gently (lean gain is slow). */
    maxGainKgPerWeek: 0.5,
    /** Trend loss above this share of body weight per week, two weeks in a row → warning. */
    rapidLossShare: 0.015,
    rapidLossWeeks: 2,
    /** Rate presets (kg per week). */
    presets: {
      lose: { gentle: 0.25, recommended: 0.5, ambitious: 0.75, aggressive: 1.0 },
      gain: { lean: 0.1, steady: 0.25, fast: 0.5 },
    },
    /** Custom rates in steps of this size. */
    rateStep: 0.05,
    /** Share of completed workout energy eaten back by default (0–100). */
    eatBackPct: 50,
    /** Protein rises from min to max g/kg as the deficit grows to this share of TDEE. */
    proteinFullDeficitShare: 0.25,
    /** Protein outside weight loss (g/kg). */
    proteinBaseGPerKg: 1.6,
    forecast: {
      /** Real pace from the trend of the last 2–4 weeks. */
      minDays: 14,
      maxDays: 28,
    },
    checkIn: {
      /** Trend days the weekly check-in reads (at least `minDays`). */
      days: 14,
      minDays: 7,
      /** On track within max(abs, share × planned rate). */
      toleranceKg: 0.05,
      toleranceShare: 0.15,
      /** One suggestion moves the daily target by at most this much. */
      maxAdjustmentKcal: 150,
    },
    plateau: {
      days: 21,
      /** Trend change below this over the plateau window counts as flat. */
      maxChangeKg: 0.3,
      /** Average logged balance at least this far below zero counts as a deficit. */
      minDeficitKcal: 200,
      /** Logged complete days in the window needed to say "despite a deficit". */
      minLoggedDays: 14,
      dietBreakWeeks: [1, 2],
    },
    reverseDietStepKcal: 100,
    training: {
      /** A week this much above the typical load is "heavy". */
      highLoadFactor: 1.2,
      /** Deficits up to this size need no change in heavy weeks. */
      smallDeficitKcal: 250,
      /** Larger deficits than this on key workout days get a warning. */
      keyDayMaxDeficitKcal: 500,
    },
  },
  limits: {
    weightKg: { min: 30, max: 300 },
    heightCm: { min: 120, max: 230 },
    age: { min: 13, max: 100 },
    bodyFatPct: { min: 3, max: 60 },
  },
} as const;

export type EnergyConfig = typeof energyConfig;
