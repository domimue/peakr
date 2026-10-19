import type { Workout } from './types';

/**
 * Workout kinds: the general name shown in the calendar ("Easy run", "Intervals") and explained
 * in the workout-type overview. The concrete session (template, level) is the detail behind it.
 */

export type KindSport = 'run' | 'bike' | 'swim' | 'strength' | 'brick' | 'winter';

export type KindCategory =
  | 'easy'
  | 'long'
  | 'tempo'
  | 'threshold'
  | 'intervals'
  | 'hills'
  | 'technique'
  | 'speed'
  | 'openwater'
  | 'test'
  | 'strength'
  | 'brick';

export interface WorkoutKind {
  sport: KindSport;
  category: KindCategory;
}

/** Every kind, in the order of the overview. */
export const WORKOUT_KINDS: readonly WorkoutKind[] = [
  ...(['easy', 'long', 'tempo', 'intervals', 'hills', 'test'] as const).map((category) => ({
    sport: 'run' as const,
    category,
  })),
  ...(
    ['easy', 'long', 'tempo', 'threshold', 'intervals', 'hills', 'technique', 'test'] as const
  ).map((category) => ({ sport: 'bike' as const, category })),
  ...(['technique', 'easy', 'threshold', 'speed', 'openwater', 'test'] as const).map(
    (category) => ({ sport: 'swim' as const, category }),
  ),
  { sport: 'brick', category: 'brick' },
  { sport: 'strength', category: 'strength' },
  { sport: 'winter', category: 'easy' },
  { sport: 'winter', category: 'intervals' },
];

const BY_TEMPLATE: Record<string, KindCategory> = {
  'run.recovery': 'easy',
  'run.easy': 'easy',
  'run.easy_strides': 'easy',
  'run.long': 'long',
  'run.progression': 'tempo',
  'run.tempo': 'tempo',
  'run.race_pace_hm': 'tempo',
  'run.race_pace_m': 'tempo',
  'run.fartlek': 'intervals',
  'run.vo2_intervals': 'intervals',
  'run.vo2_intervals_time': 'intervals',
  'run.hills_short': 'hills',
  'run.hills_long': 'hills',
  'run.uphill_hike': 'hills',
  'run.downhill': 'hills',
  'bike.recovery': 'easy',
  'bike.endurance': 'easy',
  'bike.commute': 'easy',
  'bike.long': 'long',
  'bike.tempo': 'tempo',
  'bike.sweetspot': 'threshold',
  'bike.threshold': 'threshold',
  'bike.vo2': 'intervals',
  'bike.climb': 'hills',
  'bike.cadence': 'technique',
  'swim.technique': 'technique',
  'swim.aerobic': 'easy',
  'swim.easy': 'easy',
  'swim.css': 'threshold',
  'swim.speed': 'speed',
  'swim.openwater': 'openwater',
  'xcski.easy': 'easy',
  'xcski.intervals': 'intervals',
  'skitour.ascent': 'easy',
  'snowshoe.easy': 'easy',
};

export function kindKey(kind: WorkoutKind): string {
  return `${kind.sport}.${kind.category}`;
}

/** The kind of a planned workout (by template; benchmarks are tests, routines strength). */
export function workoutKind(w: Pick<Workout, 'sport' | 'templateId' | 'role'>): WorkoutKind {
  if (w.sport === 'strength') return { sport: 'strength', category: 'strength' };
  if (w.sport === 'brick') return { sport: 'brick', category: 'brick' };
  const sport: KindSport =
    w.sport === 'run' || w.sport === 'bike' || w.sport === 'swim' ? w.sport : 'winter';
  if (w.role === 'benchmark' || w.templateId.startsWith('bench.'))
    return { sport, category: 'test' };
  return { sport, category: BY_TEMPLATE[w.templateId] ?? 'easy' };
}
