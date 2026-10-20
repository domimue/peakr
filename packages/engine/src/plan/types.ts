import type { ZoneNumber } from '../zones';
import type { CustomExercise } from './library/exercises';

/** Endurance disciplines the user can select (any combination). */
export type Sport = 'run' | 'bike' | 'swim';
export const SPORTS: readonly Sport[] = ['run', 'bike', 'swim'];

export type WinterSport = 'xcski' | 'skitour' | 'snowshoe';

/** How the user gets to work (CLAUDE.md "Commuting"). */
export type CommuteSport = 'bike' | 'run' | 'walk';
export const COMMUTE_SPORTS: readonly CommuteSport[] = ['bike', 'run', 'walk'];

/** Everything a workout can be about (WORKOUTS.md §1). */
export type ActivitySport = Sport | WinterSport | 'walk' | 'strength' | 'brick';

/** Drives "no hard days back to back" (WORKOUTS.md §11). */
export type Intensity = 'recovery' | 'easy' | 'moderate' | 'hard';

export type Phase = 'base' | 'build' | 'peak' | 'taper' | 'maintain';

/** 0 = Monday … 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Experience = 'beginner' | 'intermediate' | 'advanced';

/** Home terrain from the quiz (later learnt from Strava). */
export type Terrain = 'flat' | 'rolling' | 'hilly' | 'mountainous';

export type PoolLength = 25 | 50 | 'openwater';

export type LegLoad = 'none' | 'light' | 'heavy';

// ---------------------------------------------------------------------------------------------
// Strength (WORKOUTS.md §8)

export type StrengthMode = 'none' | 'peakr' | 'split' | 'routines' | 'log';
export type StrengthPriority = 'enduranceFirst' | 'balanced' | 'strengthFirst';
/** Gym = everything, home = dumbbells/kettlebells/bands/box, hotel = bodyweight and bands. */
export type StrengthEquipment = 'home' | 'gym' | 'hotel';
export type SplitId =
  | 'fullBody'
  | 'upperLower'
  | 'pushPullLegs'
  | 'bodyPart'
  | 'glutesLegs'
  | 'runners'
  | 'coreMobility'
  | 'kettlebell'
  | 'bodyweight';

export interface RoutineExercise {
  /** Library id or `custom:<id>` of a custom exercise; free-text entries (imports) have none. */
  exerciseId?: string;
  name?: string;
  sets: number;
  /** Reps (`"8"`, `"8–12"`) or time (`"45 s"`). */
  reps: string;
  /** Planned working weight; empty for bodyweight. */
  weightKg?: number;
  /** Rest between sets; defaults by rep range (`defaultRestSec`). */
  restSec?: number;
  /** Overrides the library value; untagged custom exercises count as `light`. */
  legLoad?: LegLoad;
}

/** A routine the user built or imported (e.g. from Hevy). */
export interface Routine {
  id: string;
  name: string;
  durationMin: number;
  exercises: RoutineExercise[];
}

export interface StrengthSetup {
  mode: StrengthMode;
  /** Defaults to `enduranceFirst` with a race goal, else `balanced`. */
  priority?: StrengthPriority;
  equipment?: StrengthEquipment;
  /** Required for mode `split`. */
  split?: SplitId;
  /** Wanted strength days per week; defaults to the split's / programme's frequency. */
  daysPerWeek?: number;
  /** Required for mode `routines`. */
  routines?: Routine[];
  /** Exercises the user added to the library (referenced by `custom:` ids in routines). */
  customExercises?: CustomExercise[];
}

// ---------------------------------------------------------------------------------------------
// Input

export interface UserProfile {
  age: number;
  experience: Experience;
  /** Selected disciplines – any non-empty combination. */
  sports: Sport[];
  terrain: Terrain;
  strength: StrengthSetup;
  /** Threshold run pace in s/km (from the race analysis); default by experience. */
  thresholdPaceSecPerKm?: number;
  /** CSS pace in s/100 m; default by experience. */
  cssPacePer100mSec?: number;
  poolLength?: PoolLength;
  /** Swim prerequisite for CSS sets (WORKOUTS.md §5). Default: true unless beginner. */
  canSwim400m?: boolean;
  hasPowerMeter?: boolean;
  /** Multisport: shifts time towards this discipline. */
  weakestSport?: Sport;
  /** Sport of the weekly long session for fitness goals; default: run if selected. */
  longSessionSport?: Sport;
  winterSports?: WinterSport[];
  /** Months 1–12 of the winter period (default Dec–Mar). */
  winterMonths?: number[];
  /** Include optional benchmark tests (default true). */
  benchmarks?: boolean;
  /** Regular commutes, placed before everything else as easy sessions. */
  commutes?: Commute[];
  /**
   * Calibration from recent activities (reference data, CLAUDE.md "Baseline from past
   * activities"). The user's own entries above always win over these values.
   */
  baseline?: PlanBaseline;
}

/** Values the plan takes from the Strava baseline instead of the quiz defaults. */
export interface PlanBaseline {
  /** Starting level class per sport (§10); falls back to `experience`. */
  experience?: Partial<Record<Sport, Experience>>;
  /** Current weekly load: week 1 starts here (within the capacity of the availability). */
  startLoad?: number;
  /** Starting duration of the long session per sport. */
  longMin?: Partial<Record<Sport, number>>;
  thresholdPaceSecPerKm?: number;
  cssPacePer100mSec?: number;
  /** Observed HRmax (only when above the age estimate) and LTHR estimate for the HR zones. */
  hrMax?: number;
  lthr?: number;
}

/** A regular commute (CLAUDE.md "Commuting"). */
export interface Commute {
  id: string;
  sport: CommuteSport;
  /** Minutes for one way (from the route when one is linked). */
  oneWayMin: number;
  /** Route from the user's library; the duration above still drives the schedule. */
  routeId?: string;
  weekdays: Weekday[];
  /** There and back (two legs) or one way only. */
  bothWays: boolean;
}

export type GoalKind =
  | '5k'
  | '10k'
  | 'half'
  | 'marathon'
  | 'fitness'
  | 'weightloss'
  | 'granfondo'
  | 'swim'
  | 'tri_sprint'
  | 'tri_olympic'
  | 'tri_70_3'
  | 'tri_full'
  | 'duathlon';

export interface Goal {
  kind: GoalKind;
}

export type WeekMinutes = readonly [number, number, number, number, number, number, number];

export interface Availability {
  /** Minutes available per weekday, Monday first. */
  minutesPerDay: WeekMinutes;
  /** Two sessions on one day allowed (e.g. swim + run). */
  doublesAllowed: boolean;
  /** Weeks that differ from the normal week ("This week is different"). */
  weekOverrides?: readonly WeekOverride[];
  /** Travel periods (travel mode). */
  travel?: readonly TravelPeriod[];
}

/**
 * One week with other availability than usual (CLAUDE.md "Irregular weeks & travel"): fewer
 * minutes on some days and/or days away. That week is rebuilt keeping its load as far as possible.
 */
export interface WeekOverride {
  /** Monday of the week. */
  weekStart: string;
  /** Minutes per weekday for this week only; default: the normal availability. */
  minutesPerDay?: WeekMinutes;
  /** Days away: no training and no commute. */
  blockedDates?: readonly string[];
}

/**
 * Travel mode for these dates: strength becomes bodyweight / hotel-room work, runs are time-based,
 * bike and swim sessions get an available alternative of equivalent load.
 */
export interface TravelPeriod {
  /** First and last day (inclusive). */
  startDate: string;
  endDate: string;
  /** A pool is available at the travel location (swims stay). */
  poolAvailable?: boolean;
  /** A bike or indoor trainer is available (rides and bricks stay). */
  bikeAvailable?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Workout structure (WORKOUTS.md §1)

export type TargetKind = 'hrZone' | 'paceZone' | 'powerZone' | 'cssOffset' | 'rpe';

/** What the watch shows, e.g. `{ kind: 'hrZone', value: 'Z2' }` or `{ kind: 'paceZone', value: 'T' }`. */
export interface Target {
  kind: TargetKind;
  value: string;
}

export interface Step {
  durationSec?: number;
  distanceM?: number;
  /** Intensity zone used by the load model (1–5). */
  zone: ZoneNumber;
  /** Primary target. */
  target: Target;
  /** Secondary hint (pace/power when HR leads, HR when pace leads). */
  hint?: Target;
  /** Multisport steps (bricks) name their discipline. */
  sport?: Sport;
  /** Rest / recovery step between reps. */
  rest?: boolean;
  /** i18n key, e.g. `steps.strides`. */
  noteKey?: string;
}

export interface Block {
  repeat: number;
  steps: Step[];
}

export interface WorkoutLevel {
  level: number;
  warmup: Step[];
  main: Block[];
  cooldown: Step[];
}

export interface StrengthSessionDef {
  /** Session RPE for the load model. */
  rpe: number;
  /** Duration of the session (gym; home sessions use the same). */
  durationMin: number;
  exercises: {
    exerciseId: string;
    sets: number;
    reps: string;
    legLoad?: LegLoad;
    weightKg?: number;
    restSec?: number;
  }[];
}

export interface WorkoutTemplate {
  id: string;
  sport: ActivitySport;
  type: string;
  intensity: Intensity;
  phases: Phase[];
  /** Ordered easy → hard; empty for purely duration-scaled types. */
  levels: WorkoutLevel[];
  /**
   * Easy/long types scale by time. With levels, the level is the fixed part and the rest of the
   * duration is filled with `fill` before the main set (e.g. strides inside an easy run).
   */
  durationScaled?: { minMin: number; maxMin: number; fill: Omit<Step, 'durationSec'> };
  terrain?: 'any' | 'flat' | 'climb' | 'descent';
  indoorAlternativeId?: string;
  legLoad: LegLoad;
  whyKey: string;
  prerequisites?: { minWeeksInPlan?: number; minLevelOf?: Record<string, number> };
  /** Highest level allowed per phase (e.g. tempo ≤ L3 in base). */
  maxLevelInPhase?: Partial<Record<Phase, number>>;
  strength?: StrengthSessionDef;
}

// ---------------------------------------------------------------------------------------------
// Output

export type SlotRole =
  | 'long'
  | 'key'
  | 'quality'
  | 'brick'
  | 'benchmark'
  | 'strength'
  | 'easy'
  | 'technique'
  | 'commute';

/** Why the scheduler did something, rendered via i18n (`notes.<key>`). */
export interface PlanNote {
  key: string;
  params?: Readonly<Record<string, string | number>>;
}

export interface WorkoutTerrain {
  /** Average gain per km the route should have. */
  gainPerKm: number;
  distanceKm: number;
  expectedGainM: number;
  /** Long running descents – no heavy legs the next day. */
  eccentric: boolean;
}

export interface ExercisePrescription {
  exerciseId: string;
  sets: number;
  reps: string;
  rpe: number;
  restSec: number;
  weightKg?: number;
}

export interface WinterVariant {
  templateId: string;
  sport: WinterSport;
  durationMin: number;
  load: number;
}

/**
 * Workout types of the UI (CLAUDE.md "UI patterns"): easy/recovery, long, tempo/threshold,
 * intervals/VO2, hills, race/test, strength, cross-training/winter, commute.
 */
export type WorkoutType =
  'easy' | 'long' | 'tempo' | 'intervals' | 'hills' | 'test' | 'strength' | 'cross' | 'commute';

export type WorkoutColorKey = `type${Capitalize<WorkoutType>}`;

export type PaceMode = 'limit' | 'target';

export interface DurationRange {
  minMin: number;
  maxMin: number;
}

export interface Workout {
  id: string;
  date: string;
  weekday: Weekday;
  sport: ActivitySport;
  templateId: string;
  /** Template type, e.g. `long`, `push` (i18n of strength sessions, classification). */
  templateType: string;
  /** Workout type for colour and naming (CLAUDE.md "UI patterns"), derived by `describeWorkout`. */
  type: WorkoutType;
  /** Theme token of the type colour, e.g. `typeEasy`. */
  colorKey: WorkoutColorKey;
  role: SlotRole;
  intensity: Intensity;
  /** Final §11 classification including neighbouring days. */
  hard: boolean;
  level: number | null;
  /** Planned duration the load model and the scheduler use. */
  durationMin: number;
  /** What the user sees: a range around `durationMin` (e.g. 30–35 min). */
  duration: DurationRange;
  /** `limit`: pace is a "no faster than" cap and HR the real target; `target`: pace is the target. */
  paceMode: PaceMode;
  load: number;
  legLoad: LegLoad;
  /** Primary target of the main set. */
  target: Target;
  warmup: Step[];
  main: Block[];
  cooldown: Step[];
  terrain: WorkoutTerrain | null;
  exercises: ExercisePrescription[] | null;
  whyKey: string;
  notes: PlanNote[];
  indoorAlternativeId: string | null;
  winterVariant: WinterVariant | null;
  /** Commute sessions: the commute they come from. */
  commuteId?: string;
  /** Planned on a travel day (travel mode). */
  travel?: boolean;
  /** Date the plan had before the user moved it ("reset week" restores it). */
  originalDate?: string;
  /** Route from the user's library chosen for this run / ride; absent = free session. */
  routeId?: string;
}

/** What kind of week it is (Plan screen tag): race week, travel week, recovery week or normal. */
export type WeekKind = 'normal' | 'recovery' | 'travel' | 'race';

export interface PlanWeek {
  index: number;
  /** 1-based position in the plan ("Week 3 of 12"). */
  number: number;
  /** Planned distance of all workouts (commutes included), km. Time: `minutes`. */
  distanceKm: number;
  kind: WeekKind;
  /** Monday of the week (ISO date). */
  startDate: string;
  phase: Phase;
  isRecovery: boolean;
  /** Fewer than 7 plan days (plan starts mid-week or ends on the target date). */
  isPartial: boolean;
  targetLoad: number;
  load: number;
  minutes: number;
  /** Share of endurance time in Z3+ (80/20 rule). */
  hardShare: number;
  workouts: Workout[];
  notes: PlanNote[];
}

export interface Plan {
  goal: Goal;
  startDate: string;
  targetDate: string | null;
  weeks: PlanWeek[];
  notes: PlanNote[];
}
