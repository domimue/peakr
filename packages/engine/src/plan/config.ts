import type { ZoneNumber } from '../zones';
import type { Equipment } from './library/exercises';
import type {
  ActivitySport,
  Experience,
  GoalKind,
  Phase,
  Sport,
  StrengthEquipment,
  StrengthPriority,
  Terrain,
} from './types';

/**
 * Every tunable number of the load model, periodisation and scheduler in one object
 * (CLAUDE.md "Training engine rules", WORKOUTS.md). Changing a value changes the plans –
 * keep the tests in sync.
 */
export const planConfig = {
  load: {
    /** TRIMP-like weight per minute in Z1 … Z5. */
    zoneWeights: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 } satisfies Record<ZoneNumber, number>,
    /** Sport factors for the same zone. Bricks use the factor of each step's sport. */
    sportFactors: {
      run: 1.0,
      bike: 0.75,
      swim: 0.7,
      xcski: 0.8,
      skitour: 0.85,
      snowshoe: 0.9,
      /** Walking commutes: low impact, low cost per minute at the same heart rate. */
      walk: 0.5,
      brick: 1.0,
      strength: 1.0,
    } satisfies Record<ActivitySport, number>,
    /** Strength: duration_min × sessionRPE / divisor. */
    strengthRpeDivisor: 2,
    /** Extra load per metre of gain per km (e.g. 20 m/km running → +12 %). */
    climbLoadPerGainPerKm: { run: 0.006, bike: 0.004 },
  },
  progression: {
    /** Max weekly load vs. the previous loading week. */
    maxWeeklyIncrease: 1.1,
    /** Planned growth of the target load per loading week (stays below the cap). */
    weeklyGrowth: 1.07,
    /** Recovery week load vs. the last loading week. */
    recoveryFactor: 0.7,
    /** Every n-th week is a recovery week (3 from age 50). */
    recoveryEvery: 4,
    recoveryEveryFromAge50: 3,
    /** Starting target load as share of the weekly capacity (all available minutes at Z2). */
    startFraction: { beginner: 0.35, intermediate: 0.45, advanced: 0.55 } satisfies Record<
      Experience,
      number
    >,
    /** Minutes per day counted for the capacity. */
    capacityMinutesPerDayCap: 150,
  },
  intensity: {
    /** 80/20: at most this share of endurance time in Z3+. */
    maxHardShare: 0.2,
  },
  phases: {
    /** Taper weeks per race goal. */
    taperWeeks: {
      '5k': 1,
      '10k': 1,
      half: 1,
      marathon: 2,
      granfondo: 1,
      swim: 1,
      tri_sprint: 1,
      tri_olympic: 1,
      tri_70_3: 2,
      tri_full: 3,
      duathlon: 1,
    } satisfies Partial<Record<GoalKind, number>>,
    /** Taper load vs. the last peak week, per taper week (the last entry repeats). */
    taperFactors: [0.6, 0.45, 0.35],
    /** Share of the non-taper weeks for peak and build; base gets the rest. */
    peakShare: 0.2,
    buildShare: 0.4,
    /** Non-race goals: block length incl. its recovery week; blocks alternate base/build. */
    nonRaceBlockWeeks: 4,
  },
  plan: {
    defaultWeeks: 12,
    maxWeeks: 52,
    /** Race goals with fewer weeks get a "short preparation" note. */
    minRaceWeeks: {
      '5k': 6,
      '10k': 8,
      half: 10,
      marathon: 14,
      granfondo: 10,
      swim: 8,
      tri_sprint: 8,
      tri_olympic: 10,
      tri_70_3: 16,
      tri_full: 20,
      duathlon: 8,
    } satisfies Partial<Record<GoalKind, number>>,
    maxMinutesPerDay: 600,
    minSessionMin: 20,
    /** At least this many days with ≥ minSessionMin. */
    minTrainingDays: 2,
    weightLossMinAge: 18,
  },
  sessions: {
    /** Endurance sessions per week by experience (limited by available days). */
    perWeek: { beginner: 3, intermediate: 4, advanced: 5 } satisfies Record<Experience, number>,
    /** Fitness goals: first week with a light quality session. */
    fitnessQualityFromWeek: 4,
    fitnessQualityMaxLevel: 3,
    /** Strides are added to easy runs from this base week. */
    stridesFromWeek: 3,
    /** Sprint triathlon: brick every n-th build/peak week, other goals every week. */
    sprintBrickEvery: 2,
    /** Swim beginners do technique until this technique level, then CSS sets. */
    techniqueLevelBeforeCss: 4,
  },
  /**
   * Difficulty slider 1–10 (CLAUDE.md "Training engine rules → Difficulty"): 5 is exactly what the
   * engine computes. Each step scales the weekly target load and the long-session increase by
   * `perStep`; every safety rule (+10 % cap, recovery weeks, 80/20, no hard days back to back,
   * start floors) is applied after it and still holds at every setting.
   */
  difficulty: { min: 1, max: 10, neutral: 5, perStep: 0.04 },
  /**
   * Hard floors of a new plan (CLAUDE.md "Baseline"): it never starts below what the athlete
   * demonstrably does. Statistics-free; the only exception is a return after a pause or injury.
   */
  floors: {
    /** First long session ≥ this share of the recent typical long session. */
    longShare: 0.9,
    /** Week-1 minutes per sport ≥ this share of the last four weeks (5-minute rounding of sessions). */
    volumeShare: 0.95,
    /** Speeds used to turn a distance from the quiz into minutes when no pace is known. */
    defaultSpeedKmh: { run: 10, bike: 25, swim: 2.5 } satisfies Record<Sport, number>,
  },
  long: {
    /** Start duration of the long session by experience. */
    startMin: {
      run: { beginner: 45, intermediate: 60, advanced: 75 },
      bike: { beginner: 75, intermediate: 90, advanced: 120 },
      swim: { beginner: 25, intermediate: 35, advanced: 45 },
    } satisfies Record<Sport, Record<Experience, number>>,
    /** Max +10 min per loading week, −20 % in recovery weeks. */
    weeklyIncreaseMin: 10,
    recoveryFactor: 0.8,
    /** Long run cap per goal (WORKOUTS.md §3); other goals use `default`. */
    runCapMin: {
      '5k': 90,
      '10k': 90,
      half: 135,
      marathon: 180,
      default: 100,
      tri_sprint: 75,
      tri_olympic: 90,
      tri_70_3: 120,
      tri_full: 150,
    } as Partial<Record<GoalKind | 'default', number>> & { default: number },
    swimCapMin: { default: 75 } as Partial<Record<GoalKind | 'default', number>> & {
      default: number;
    },
    bikeCapMin: {
      granfondo: 360,
      default: 150,
      tri_sprint: 90,
      tri_olympic: 150,
      tri_70_3: 240,
      tri_full: 330,
      duathlon: 180,
    } as Partial<Record<GoalKind | 'default', number>> & { default: number },
  },
  levels: {
    start: { beginner: 1, intermediate: 3, advanced: 5 } satisfies Record<Experience, number>,
    /** Taper uses the current level minus this. */
    taperLevelDrop: 2,
    /** Level drop after a pause of up to n days (§10); longer pauses drop `longPauseDrop`. */
    pauseDrops: [
      { maxDays: 7, drop: 1 },
      { maxDays: 14, drop: 2 },
    ],
    longPauseDrop: 3,
  },
  paces: {
    /** Default threshold pace (s/km) and CSS (s/100 m) when the user has no test result. */
    thresholdSecPerKm: { beginner: 375, intermediate: 315, advanced: 265 } satisfies Record<
      Experience,
      number
    >,
    cssSecPer100m: { beginner: 150, intermediate: 120, advanced: 100 } satisfies Record<
      Experience,
      number
    >,
    /** Run pace labels as a multiple of threshold pace. */
    runPaceFactors: { R: 0.85, I: 0.92, T: 1.0, HMP: 1.03, MP: 1.08, E: 1.25 } as Record<
      string,
      number
    >,
    /** Easy riding speed on the flat (km/h) by experience. */
    bikeFlatSpeedKmh: { beginner: 22, intermediate: 26, advanced: 30 } satisfies Record<
      Experience,
      number
    >,
  },
  terrain: {
    /** Typical gain per km of the home terrain. */
    gainPerKm: {
      run: { flat: 2, rolling: 10, hilly: 20, mountainous: 35 },
      bike: { flat: 3, rolling: 7, hilly: 12, mountainous: 20 },
    } satisfies Record<'run' | 'bike', Record<Terrain, number>>,
    /** Easy/quality sessions are planned on routes no hillier than this. */
    easyGainCapPerKm: { run: 12, bike: 10 },
    /** §11: sessions at or above this gain per km count as hard. */
    hardGainPerKm: { run: 25, bike: 15 },
    /** Running descents from this gain per km and duration add eccentric load. */
    eccentric: { minGainPerKm: 20, minDurationMin: 60 },
    /** Max ~5 % faster than flat pace downhill. */
    downhillMaxSpeedup: 0.05,
    /** Steep kilometres are split into shorter segments. */
    steepGradient: 0.08,
    segmentM: 1000,
    steepSegmentM: 250,
    /** Bike fallback: extra minutes per 100 m of gain. */
    bikeMinPer100mGain: 10,
    /** Per-km pace range around the target (±). */
    paceRange: 0.03,
  },
  multisport: {
    /** Share of endurance time per discipline. Unlisted combinations split evenly. */
    split: {
      tri: { swim: 0.2, bike: 0.45, run: 0.35 },
      duathlon: { bike: 0.55, run: 0.45 },
    } satisfies Record<string, Partial<Record<Sport, number>>>,
    /** Moved from the strongest (largest share) to the weakest sport. */
    weakestShift: 0.05,
    /** Single-sport goal with other sports selected: share of the goal sport. */
    primaryShare: 0.75,
    /** Race durations (min) for brick L5 race simulations. */
    raceBikeMin: { tri_sprint: 40, tri_olympic: 75, tri_70_3: 170, tri_full: 360, duathlon: 60 },
    raceRunMin: { tri_sprint: 25, tri_olympic: 50, tri_70_3: 120, tri_full: 270, duathlon: 30 },
  },
  strength: {
    /** Leg volume per phase (§8.3); recovery weeks additionally × recoveryFactor. */
    legScaling: {
      enduranceFirst: { base: 1, build: 0.8, peak: 0.5, taper: 0, maintain: 1 },
      balanced: { base: 1, build: 0.9, peak: 0.7, taper: 0.3, maintain: 1 },
      strengthFirst: { base: 1, build: 1, peak: 1, taper: 0, maintain: 1 },
    } satisfies Record<StrengthPriority, Record<Phase, number>>,
    /** Upper-body volume in taper weeks (≤ 30 %). */
    taperUpperScaling: 0.3,
    recoveryFactor: 0.6,
    /** Below this leg scaling a heavy-leg session is prescribed as light. */
    heavyMinScaling: 0.5,
    /** Peakr programme sessions per week by phase (§8.4). */
    peakrPerWeek: { base: 2, build: 2, peak: 1, taper: 1, maintain: 2 } satisfies Record<
      Phase,
      number
    >,
    homeDurationFactor: 0.8,
    /** Double progression (§8.5). */
    progression: { upperIncrease: 0.025, lowerIncrease: 0.05, maxRpe: 8, roundToKg: 0.5 },
    /** Weights after a pause (§8.5: 80–90 %). */
    resumeFactor: 0.85,
    /** Pauses longer than this resume at `resumeFactor` of the previous weights. */
    resumePauseDays: 7,
    /** Equipment each setting provides (§8.6); exercises need at least one of their items. */
    equipment: {
      gym: [
        'barbell',
        'ezBar',
        'trapBar',
        'dumbbell',
        'kettlebell',
        'machine',
        'smith',
        'cable',
        'band',
        'bodyweight',
        'box',
      ],
      home: ['dumbbell', 'kettlebell', 'band', 'bodyweight', 'box'],
      hotel: ['band', 'bodyweight'],
    } satisfies Record<StrengthEquipment, readonly Equipment[]>,
    /** Rest between sets by the top of the rep range, and for timed / core / mobility work. */
    rest: { maxRepsLow: 6, lowRepsSec: 150, moderateSec: 90, highRepsSec: 60, timedSec: 45 },
  },
  benchmarks: {
    /** Tests in the first full loading week and then every n weeks (base/build only). */
    everyWeeks: 6,
  },
  winter: {
    defaultMonths: [12, 1, 2, 3],
    /** A winter variant must be within this share of the original session's load. */
    loadTolerance: 0.1,
  },
  commute: {
    /** One-way duration limits (minutes). */
    oneWayMin: { min: 5, max: 180 },
    /** Days with at least this many commute minutes get no hard session if another day fits. */
    heavyDayMin: 60,
  },
  travel: {
    /** Bike/swim replacements are easy runs no longer than this (never a hard long run). */
    maxReplacementMin: 75,
  },
  edit: {
    /** Resume after a pause: first week load vs. the last loading week (CLAUDE.md "Pause"). */
    resume: [
      { maxDays: 7, factor: 0.8 },
      { maxDays: 14, factor: 0.7 },
    ],
    /** Longer pauses resume at this share and re-enter Base. */
    longPauseFactor: 0.6,
    /** Session RPE cap of a strength session made easier. */
    easedStrengthMaxRpe: 7,
    /** Max other workouts the rebalance moves after the user moved one. */
    maxRebalanceMoves: 3,
    /** Weight of each broken rule when the rebalance compares two arrangements of a week. */
    ruleWeights: {
      tooManySessions: 3,
      sameSportOneDay: 3,
      twoHardOneDay: 3,
      backToBackHard: 2,
      heavyLegsBeforeKey: 2,
      heavyLegsAfterDescent: 2,
      overAvailability: 1,
    },
  },
  distance: {
    /** Run pace label per load zone (Z1 is a bit slower than easy pace). */
    runPaceLabel: { 1: 'E', 2: 'E', 3: 'MP', 4: 'T', 5: 'I' } satisfies Record<ZoneNumber, string>,
    runZ1Slowdown: 1.08,
    /** Bike speed per zone as a multiple of the easy flat speed. */
    bikeSpeedFactor: { 1: 0.85, 2: 1, 3: 1.1, 4: 1.18, 5: 1.25 } satisfies Record<
      ZoneNumber,
      number
    >,
    /** Swim pace per zone: seconds per 100 m added to CSS. */
    swimCssOffset: { 1: 15, 2: 10, 3: 5, 4: 0, 5: -8 } satisfies Record<ZoneNumber, number>,
  },
  lookAhead: {
    /** Full workout details for the current week and the next 3 (CLAUDE.md "Look-ahead"). */
    weeks: 4,
  },
  /** Imported activities (CLAUDE.md "Automatic activity sync"). */
  activities: {
    /** Same activity from two sources: start times at most this far apart … */
    dedupeStartToleranceSec: 5 * 60,
    /** … and durations differing by at most this share of the longer one. */
    dedupeDurationTolerance: 0.1,
    /**
     * Source priority for the merged record, highest first: the watch provider, then Strava,
     * then the phone's health data.
     */
    sourcePriority: ['garmin', 'coros', 'suunto', 'apple', 'strava', 'healthconnect', 'healthkit'],
    /** Zone assumed when an activity has no heart rate. */
    defaultZone: 2,
    /** Session RPE assumed for imported strength without perceived exertion. */
    strengthDefaultRpe: 7,
    /** An activity counts as hard with an average HR in this zone or above … */
    hardZone: 4,
    /** … or in Z3+ for at least this long … */
    tempoZone: 3,
    tempoMinMin: 30,
    /** … or when it is at least this long (long session), per sport. */
    longMin: { run: 90, bike: 180, swim: 75, walk: 240, xcski: 150, skitour: 180, snowshoe: 180 },
    /**
     * Unplanned activity: its load is taken off the easy sessions left in that week, each shortened
     * to at least this many minutes. Only this share of the activity's load is taken off, so the
     * week keeps a little more than planned instead of being cut to the bone.
     */
    absorbShare: 0.8,
    minEasyMin: 20,
  },
  /** Route library, matching, recognition and evaluation (CLAUDE.md "Terrain intelligence"). */
  routes: {
    /** GPX files above this size (characters) or point count are rejected. */
    gpxMaxChars: 20_000_000,
    gpxMaxPoints: 200_000,
    /** Elevation smoothing window (distance-based moving average). */
    smoothingWindowM: 100,
    /** Gain/loss count only changes larger than this (hysteresis against GPS noise). */
    gainHysteresisM: 3,
    /** Spacing of the stored elevation profile. */
    profileStepM: 25,
    /** Tolerance of the Douglas–Peucker simplification of the stored track. */
    simplifyToleranceM: 5,
    /** A climb: contiguous section at least this steep and long. */
    climb: { minGradient: 0.03, minLengthM: 150 },
    /** Hill sessions need a climb of this length and average gradient. */
    hillClimb: {
      minLengthM: 200,
      maxLengthM: 400,
      minGradient: 0.05,
      maxGradient: 0.08,
      /** Steady: every 50 m piece of the segment stays within this gradient band. */
      pieceM: 50,
      pieceMinGradient: 0.03,
      pieceMaxGradient: 0.1,
    },
    /** Bike climbing sessions need a climb at least this long. */
    bikeClimbMinLengthM: 1000,
    /** Matching weights (sum 1) and tolerances. */
    match: {
      weights: { duration: 0.45, elevation: 0.3, start: 0.25 },
      /** Duration score falls to 0 at this relative deviation. */
      durationTolerance: 0.35,
      /** Elevation score falls to 0 at this deviation in gain per km. */
      elevationToleranceGainPerKm: 15,
      /** Start score falls to 0 at this distance from the user's start. */
      startMaxM: 5000,
    },
    /**
     * Generated round trips (Phase 8b): how many candidates to ask the routing provider for, how
     * much shorter a hilly session's route gets than its flat distance, and the elevation band the
     * candidates are judged against.
     */
    generate: {
      candidates: 5,
      /** Run: flat metres one metre of climbing costs (rough; the real profile is scored after). */
      runFlatMPerGainM: 8,
      /** Half width of the desired gain-per-km band around the session's terrain. */
      bandHalfWidthGainPerKm: 5,
      /** Shortest and longest round trip that is generated. */
      minDistanceM: 2000,
      maxDistanceM: 150_000,
      /** Share of the match score that depends on the surface (when the provider knows it). */
      surfaceWeight: 0.3,
    },
    /** Bike segment model: sustainable climbing rate (m/h) and max descent speed (km/h). */
    bike: {
      climbRateMh: { beginner: 500, intermediate: 700, advanced: 900 } satisfies Record<
        Experience,
        number
      >,
      maxDescentKmh: 45,
      descentSpeedupPerGradient: 3,
    },
    /** Route recognition from past activities. */
    recognition: {
      startRadiusM: 200,
      distanceTolerance: 0.1,
      samplePoints: 64,
      maxMeanDeviationM: 75,
      minOccurrences: 2,
    },
    /** Evaluation: a km is "in range" within this share of the planned pace. */
    evaluationTolerance: 0.03,
    /** Learned terrain profile: activities of the last n days, at least m of them. */
    profile: { windowDays: 90, minActivities: 3 },
  },
  /** Zwift workout export (CLAUDE.md "Zwift"). */
  zwift: {
    /** Zwift ignores files of this size and above. */
    maxFileBytes: 64 * 1024,
    /** HR-only bike steps: share of FTP per zone when the plan gives no power range. */
    zoneFtpFraction: { 1: 0.5, 2: 0.65, 3: 0.83, 4: 1, 5: 1.13 },
    /** Warm-up ramps up from, cool-down ramps down to, this share of FTP. */
    rampFtpFraction: 0.45,
    /**
     * Run steps: Zwift run pace level per zone (Zwift scales it to the user's own run pace, 1 is
     * an easy jog, 5 is about 5k pace). To be confirmed against a real Zwift import.
     */
    runPaceLevel: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
  },
  /**
   * Indoor versions of outdoor sessions (CLAUDE.md "Weather check", WORKOUTS.md §3–5). The
   * treadmill does not feel like the road: no air resistance, no descents, warmer and monotonous –
   * so it gets an incline, notes for heat and belt ramp-up, and long or downhill runs prefer
   * "move to another day".
   */
  indoor: {
    /** 1 % replaces the missing air resistance on the flat. */
    treadmillFlatInclinePct: 1,
    treadmillHillInclinePct: 6,
    treadmillMaxInclinePct: 8,
    /** Long treadmill runs from this length get the "split it into two halves" note. */
    treadmillSplitFromMin: 75,
    /** Longer runs than this prefer moving to another day over the treadmill. */
    treadmillPreferMoveFromMin: 90,
    /** Endurance rides are capped indoors (WORKOUTS.md §4) … */
    trainerMaxMin: 90,
    /** … and count denser: no coasting, no stops (1 min indoors ≈ 1.2 min outside). */
    trainerDensity: 1.2,
  },
  /**
   * Weather check – rain, snow, ice, storm only, no heat logic (CLAUDE.md "Real-life & seasonal
   * adaptation" 4). Thresholds per hour of the session; `null` = this reason never applies.
   */
  weather: {
    /** Heavy rain: mm in one hour, or this total over the session. */
    heavyRainMmPerHour: { run: 4, bike: 2.5, swim: null, winter: null },
    heavyRainSessionMm: { run: 8, bike: 5, swim: null, winter: null },
    /** Snowfall in cm per hour (any real snow on a bike, more for a run). */
    snowCmPerHour: { run: 1, bike: 0.2, swim: null, winter: null },
    /** Wind gusts in km/h (falling branches, crosswinds on the bike, waves in open water). */
    stormGustKmh: { run: 65, bike: 50, swim: 40, winter: 70 },
    /** Ice: precipitation while at or below this temperature … */
    iceTempC: 0.5,
    iceMinPrecipMm: 0.1,
    /** … or freezing temperature after this much rain in the hours before (black ice). */
    blackIceLookbackHours: 6,
    blackIceWetMm: 0.5,
    /** Session time when the user has not set one (local hour). */
    defaultSessionHour: 18,
    /** Days to look at for "move to another day". */
    moveOptions: 3,
  },
  /**
   * Plan calibration from recent activities (CLAUDE.md "Baseline from past activities"). Which
   * activities count per value is documented in `baseline/derive.ts` and WORKOUTS.md §10.
   */
  baseline: {
    /** Only activities of the last n days are read, never older. */
    windowDays: 60,
    /** At least this many full weeks must be covered for weekly volume and week-1 load. */
    minWeeks: 2,
    /** Week-1 load: trimmed mean over the last n full weeks. */
    recentWeeks: 4,
    trim: 0.25,
    /** Minimum number of activities per derived value; below: "not enough data". */
    min: {
      volume: 3,
      terrain: 3,
      easyRuns: 4,
      easySubset: 3,
      paceHr: 4,
      hrMax: 3,
      lthrEfforts: 2,
      swims: 3,
    },
    /**
     * Activities are first sorted into easy / long / other per sport, relative to that person's own
     * sessions: long = at least `longFactor` × the sport's median duration and at least
     * `longMinMin`. Outliers are then looked for inside each kind only, so a long run is compared
     * with long runs and never thrown out for being longer than the easy runs.
     */
    classify: {
      longFactor: 1.4,
      longMinMin: { run: 60, bike: 120, swim: 45 } satisfies Record<Sport, number>,
    },
    /**
     * Outliers inside one kind: unticked when longer than median + k × MAD of that kind and at
     * least this multiple of its median duration. A kind needs `min.volume` sessions to be judged.
     */
    outlierMadFactor: 3,
    outlierMinFactor: 2.5,
    /** The typical long session is the median long session of the last n days. */
    longRecentDays: 42,
    /** Week-1 volume floor: the plain mean of the last n full weeks per sport. */
    floorWeeks: 4,
    /** Runs shorter than this are not used for paces. */
    minRunDistanceM: 1000,
    /** HRmax: the n-th highest observed value (protects against strap spikes). */
    hrMaxRank: 2,
    /** LTHR: Friel – 95 % of the best 20-minute average HR. */
    lthrFrom20MinFactor: 0.95,
    /** Fallback: average HR of hard efforts of this duration (at least this share of HRmax). */
    lthrEffort: { minSec: 20 * 60, maxSec: 60 * 60, minShareOfHrMax: 0.85 },
    /** CSS estimate: fastest third of swims ≥ this distance, pace × factor. */
    cssMinSwimM: 400,
    cssFactor: 0.97,
    /** Level class per sport from sessions per week, weekly minutes and longest session. */
    levels: {
      run: {
        intermediate: { sessions: 2, weeklyMin: 90, longestMin: 30 },
        advanced: { sessions: 4, weeklyMin: 240, longestMin: 75 },
      },
      bike: {
        intermediate: { sessions: 2, weeklyMin: 150, longestMin: 60 },
        advanced: { sessions: 3, weeklyMin: 360, longestMin: 150 },
      },
      swim: {
        intermediate: { sessions: 2, weeklyMin: 60, longestMin: 30 },
        advanced: { sessions: 3, weeklyMin: 150, longestMin: 50 },
      },
    } satisfies Record<
      Sport,
      Record<
        'intermediate' | 'advanced',
        { sessions: number; weeklyMin: number; longestMin: number }
      >
    >,
  },
} as const;

export type PlanConfig = typeof planConfig;
