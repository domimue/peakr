import { workoutKind, type KindCategory, type WorkoutKind } from './kinds';
import { flattenSteps, totalDurationSec } from './load';
import { athleteFor, runPaceSecPerKm } from './materialize';
import { annotateWeeks } from './week-facts';
import type {
  DurationRange,
  PaceMode,
  Plan,
  UserProfile,
  Workout,
  WorkoutColorKey,
  WorkoutType,
} from './types';

/**
 * Derived UI fields of a workout (CLAUDE.md "UI patterns"): its type and colour token, the
 * duration range the user sees and whether pace is a limit or a target.
 */

export const WORKOUT_TYPES: readonly WorkoutType[] = [
  'easy',
  'long',
  'tempo',
  'intervals',
  'hills',
  'test',
  'strength',
  'cross',
  'commute',
];

const BY_CATEGORY: Record<KindCategory, WorkoutType> = {
  easy: 'easy',
  long: 'long',
  tempo: 'tempo',
  threshold: 'tempo',
  intervals: 'intervals',
  hills: 'hills',
  technique: 'easy',
  speed: 'intervals',
  openwater: 'easy',
  test: 'test',
  strength: 'strength',
  // A brick is a quality session; its sport icon names it.
  brick: 'tempo',
  commute: 'commute',
};

type TypeInput = Pick<Workout, 'sport' | 'templateId' | 'role'>;

/** UI type of a workout kind; winter sessions are cross-training whatever their intensity. */
export function kindWorkoutType(kind: WorkoutKind): WorkoutType {
  return kind.sport === 'winter' ? 'cross' : BY_CATEGORY[kind.category];
}

export function workoutType(w: TypeInput): WorkoutType {
  return kindWorkoutType(workoutKind(w));
}

export function typeColorKey(type: WorkoutType): WorkoutColorKey {
  return `type${type.charAt(0).toUpperCase()}${type.slice(1)}` as WorkoutColorKey;
}

/** Easy, long, commute and winter sessions: pace is a "no faster than" cap, HR leads. */
export function paceMode(w: Pick<Workout, 'intensity'> & { type: WorkoutType }): PaceMode {
  if (w.intensity === 'recovery' || w.intensity === 'easy') return 'limit';
  return w.type === 'easy' || w.type === 'long' || w.type === 'commute' || w.type === 'cross'
    ? 'limit'
    : 'target';
}

/** Share of the duration a session may vary to either side (e.g. 50 → 45–55 min). */
const FLEX = 0.08;
/** Structured sessions: only warm-up and cool-down flex, by this share of their time. */
const STRUCTURED_FLEX = 0.25;

/**
 * Easy runs: the pace the user should not go faster than (their easy pace, s/km); HR is the real
 * target. Null when pace is a target or the session is not a run.
 */
export function paceLimitSecPerKm(
  w: Pick<Workout, 'sport' | 'paceMode'>,
  profile: UserProfile,
): number | null {
  if (w.paceMode !== 'limit' || w.sport !== 'run') return null;
  return Math.round(runPaceSecPerKm(athleteFor(profile, 'fitness'), 'E'));
}

const round5 = (min: number) => Math.round(min / 5) * 5;

type RangeInput = Pick<
  Workout,
  'durationMin' | 'sport' | 'level' | 'role' | 'warmup' | 'main' | 'cooldown'
>;

/**
 * Duration as the user sees it: a range about ±8 % wide in steps of 5 min (at least 5 min wide)
 * that contains the planned duration. Structured endurance sessions flex only in warm-up and
 * cool-down; commutes are fixed.
 */
export function durationRange(w: RangeInput): DurationRange {
  const d = w.durationMin;
  if (w.role === 'commute') return { minMin: d, maxMin: d };
  let flex = d * FLEX;
  if (w.sport !== 'strength' && w.level !== null) {
    const edgeMin = totalDurationSec(flattenSteps(w.warmup, [], w.cooldown)) / 60;
    flex = Math.min(flex, edgeMin * STRUCTURED_FLEX);
  }
  const width = Math.max(5, round5(2 * flex));
  const minMin = Math.min(d, Math.max(5, round5(d - width / 2)));
  return { minMin, maxMin: Math.max(d, minMin + width) };
}

type DescribeInput = Omit<Workout, 'type' | 'colorKey' | 'duration' | 'paceMode'> &
  Partial<Pick<Workout, 'type' | 'colorKey' | 'duration' | 'paceMode'>>;

/** Sets the derived fields (type, colour token, duration range, pace mode) from the rest. */
export function describeWorkout(w: DescribeInput): Workout {
  const type = workoutType(w);
  return {
    ...w,
    type,
    colorKey: typeColorKey(type),
    duration: durationRange(w),
    paceMode: paceMode({ intensity: w.intensity, type }),
  };
}

/**
 * Upgrades a plan stored before the derived fields existed: the old `type` field held the template
 * type (now `templateType`); everything derived – workout types and the week figures – is
 * computed again.
 */
export function normalizePlan(plan: Plan, profile: UserProfile): Plan {
  return annotateWeeks(
    {
      ...plan,
      weeks: plan.weeks.map((week) => ({
        ...week,
        workouts: week.workouts.map((raw) => {
          const legacy = raw as Workout & { templateType?: string };
          const templateType = legacy.templateType ?? (legacy.type as string);
          return describeWorkout({ ...legacy, templateType });
        }),
      })),
    },
    profile,
  );
}
