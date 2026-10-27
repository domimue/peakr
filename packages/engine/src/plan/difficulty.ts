import { planConfig } from './config';

const cfg = planConfig.difficulty;

/** The setting clamped to 1–10 (whole steps); missing = 5. */
export function difficultyLevel(level: number | undefined): number {
  if (level === undefined || !Number.isFinite(level)) return cfg.neutral;
  return Math.min(cfg.max, Math.max(cfg.min, Math.round(level)));
}

/**
 * Target multiplier: 0.84 at 1, 1.00 at 5, 1.20 at 10. Above 5 it scales every weekly target and
 * the long-session increase; below 5 it slows the progression (`difficultyGrowth`) and the
 * long-session increase instead of cutting weeks, so no week loses its required structure.
 */
export function difficultyFactor(level: number | undefined): number {
  return 1 + (difficultyLevel(level) - cfg.neutral) * cfg.perStep;
}

/** Growth per loading week: +7 % from 5 up, down to holding the load (+0 %) at 1. */
export function difficultyGrowth(level: number | undefined): number {
  const growth = planConfig.progression.weeklyGrowth - 1;
  const l = Math.min(cfg.neutral, difficultyLevel(level));
  return 1 + (growth * (l - cfg.min)) / (cfg.neutral - cfg.min);
}
