import { planConfig } from './config';
import type { Experience, Phase, WorkoutTemplate } from './types';

const cfg = planConfig.levels;

/** Start level for a levelled template from the quiz experience (WORKOUTS.md §10). */
export function startLevel(experience: Experience, template: WorkoutTemplate): number {
  return Math.max(1, Math.min(cfg.start[experience], template.levels.length));
}

/** Keeps a level inside the template and the phase limit (e.g. tempo ≤ L3 in base). */
export function clampLevel(template: WorkoutTemplate, level: number, phase: Phase): number {
  const phaseMax = template.maxLevelInPhase?.[phase] ?? template.levels.length;
  return Math.max(1, Math.min(level, template.levels.length, phaseMax));
}

/**
 * Result of a completed levelled session:
 * - `targetsMet`: targets met (≥ 80 % of work time in range) and RPE ≤ planned
 * - `targetsMissed`: completed, but RPE above planned or targets missed
 * - `missedTwice`: not completed / skipped twice in a row
 */
export type SessionOutcome = 'targetsMet' | 'targetsMissed' | 'missedTwice';

/** +1 / hold / −1 (max +1 per week per type is enforced by the caller). */
export function nextLevel(level: number, outcome: SessionOutcome, maxLevel: number): number {
  if (outcome === 'targetsMet') return Math.min(maxLevel, level + 1);
  if (outcome === 'missedTwice') return Math.max(1, level - 1);
  return level;
}

/** Recovery weeks use one level lower, then the progression continues. */
export function recoveryWeekLevel(level: number): number {
  return Math.max(1, level - 1);
}

/** Pause: ≤ 7 days −1 level, ≤ 14 days −2 levels, longer back to base rules. */
export function levelAfterPause(level: number, pauseDays: number): number {
  const drop = cfg.pauseDrops.find((p) => pauseDays <= p.maxDays)?.drop ?? cfg.longPauseDrop;
  return Math.max(1, level - drop);
}

const strengthCfg = planConfig.strength;

export interface StrengthProgressInput {
  weightKg: number;
  repRange: { min: number; max: number };
  /** Reps achieved per set last time. */
  repsPerSet: number[];
  sessionRpe: number;
  lowerBody: boolean;
}

/**
 * Double progression (§8.5): when every set reached the top of the rep range at RPE ≤ 8, add
 * 2.5 % (upper) / 5 % (lower) and restart at the bottom of the range; otherwise add a rep.
 */
export function progressStrength(input: StrengthProgressInput): {
  weightKg: number;
  targetReps: number;
} {
  const { weightKg, repRange, repsPerSet, sessionRpe, lowerBody } = input;
  const p = strengthCfg.progression;
  const allTop = repsPerSet.length > 0 && repsPerSet.every((r) => r >= repRange.max);
  if (allTop && sessionRpe <= p.maxRpe) {
    const factor = 1 + (lowerBody ? p.lowerIncrease : p.upperIncrease);
    return {
      weightKg: Math.round((weightKg * factor) / p.roundToKg) * p.roundToKg,
      targetReps: repRange.min,
    };
  }
  const lowest = repsPerSet.length > 0 ? Math.min(...repsPerSet) : repRange.min - 1;
  return { weightKg, targetReps: Math.min(repRange.max, Math.max(repRange.min, lowest + 1)) };
}

/** Recovery-week deload: −40 % sets, same weights. */
export function deloadSets(sets: number): number {
  return Math.max(1, Math.round(sets * strengthCfg.recoveryFactor));
}

/** After a pause: resume at 80–90 % of the previous weights. */
export function resumeWeightKg(weightKg: number): number {
  return (
    Math.round((weightKg * strengthCfg.resumeFactor) / strengthCfg.progression.roundToKg) *
    strengthCfg.progression.roundToKg
  );
}
