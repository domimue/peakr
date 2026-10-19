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
      gym: ['barbell', 'dumbbell', 'kettlebell', 'machine', 'cable', 'band', 'bodyweight', 'box'],
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
} as const;

export type PlanConfig = typeof planConfig;
