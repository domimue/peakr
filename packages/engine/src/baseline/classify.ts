import { planConfig } from '../plan/config';
import { SPORTS } from '../plan/types';
import { median } from '../stats';
import type { BaselineActivity } from './types';

const cfg = planConfig.baseline.classify;

/**
 * What a recent session was for this athlete: `long` – clearly longer than their usual sessions of
 * that sport; `other` – a race; `easy` – everything else (the usual sessions, quality ones
 * included). Relative to the person's own distribution, so a 13 km run is "long" for someone who
 * usually runs 7 km and "easy" for someone who usually runs 15 km.
 */
export type BaselineKind = 'easy' | 'long' | 'other';

/** Kind per activity (by `externalId`). Deterministic, no randomness, no order dependence. */
export function classifyBaseline(
  activities: readonly BaselineActivity[],
): Map<string, BaselineKind> {
  const kinds = new Map<string, BaselineKind>();
  for (const sport of SPORTS) {
    const own = activities.filter((a) => a.sport === sport);
    const usual = median(own.filter((a) => !a.race).map((a) => a.durationSec)) ?? 0;
    const threshold = Math.max(cfg.longFactor * usual, cfg.longMinMin[sport] * 60);
    for (const a of own) {
      kinds.set(a.externalId, a.race ? 'other' : a.durationSec >= threshold ? 'long' : 'easy');
    }
  }
  return kinds;
}
