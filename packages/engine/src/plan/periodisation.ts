import { assertDefined } from '../result';
import { planConfig } from './config';
import type { GoalKind, Phase } from './types';

const cfg = planConfig.phases;
const prog = planConfig.progression;

export interface WeekSkeleton {
  index: number;
  phase: Phase;
  isRecovery: boolean;
  /** 0-based position inside the taper, null outside. */
  taperIndex: number | null;
}

type RaceGoal = keyof typeof cfg.taperWeeks;

export function isRaceGoal(goal: GoalKind): goal is RaceGoal {
  return goal in cfg.taperWeeks;
}

export function recoveryEvery(age: number): number {
  return age >= 50 ? prog.recoveryEveryFromAge50 : prog.recoveryEvery;
}

/**
 * Phases per week. Race goals: Base → Build → Peak → Taper; non-race goals loop Base/Build blocks.
 * Every n-th week is a recovery week (never inside the taper and never the last week before it).
 */
export function buildSkeleton(weeks: number, goal: GoalKind, age: number): WeekSkeleton[] {
  const every = recoveryEvery(age);
  const recovery = (i: number, lastLoadingIndex: number) =>
    (i + 1) % every === 0 && i < lastLoadingIndex;

  if (!isRaceGoal(goal)) {
    return Array.from({ length: weeks }, (_, i) => ({
      index: i,
      phase: Math.floor(i / every) % 2 === 0 ? 'base' : 'build',
      isRecovery: (i + 1) % every === 0,
      taperIndex: null,
    }));
  }

  const taper = Math.min(cfg.taperWeeks[goal], weeks - 1);
  const loading = weeks - taper;
  const peak = loading >= 3 ? Math.max(1, Math.round(loading * cfg.peakShare)) : 0;
  const build = loading >= 2 ? Math.max(1, Math.round(loading * cfg.buildShare)) : 0;
  const base = loading - peak - build;
  return Array.from({ length: weeks }, (_, i) => {
    if (i >= loading)
      return { index: i, phase: 'taper', isRecovery: false, taperIndex: i - loading };
    const phase: Phase = i < base ? 'base' : i < base + build ? 'build' : 'peak';
    return { index: i, phase, isRecovery: recovery(i, loading - 1), taperIndex: null };
  });
}

/**
 * Target load of a week from the actual load of the last full loading week: loading weeks grow by
 * `weeklyGrowth` (below the +10 % cap), recovery weeks are ~70 %, taper weeks step down from the
 * last peak week. The first week uses `startLoad`.
 */
export function weekTargetLoad(
  week: WeekSkeleton,
  lastLoading: number | null,
  startLoad: number,
): number {
  const reference = lastLoading ?? startLoad;
  if (week.taperIndex !== null) {
    const i = Math.min(week.taperIndex, cfg.taperFactors.length - 1);
    return reference * assertDefined(cfg.taperFactors[i], 'taperFactor');
  }
  if (week.isRecovery) return reference * prog.recoveryFactor;
  return lastLoading === null ? startLoad : lastLoading * prog.weeklyGrowth;
}
