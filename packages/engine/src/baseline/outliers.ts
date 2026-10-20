import { planConfig } from '../plan/config';
import { SPORTS } from '../plan/types';
import { mad, median } from '../stats';
import type { BaselineActivity } from './types';

const cfg = planConfig.baseline;

export type OutlierReason = 'race' | 'muchLonger';

export interface SelectionSuggestion {
  externalId: string;
  selected: boolean;
  reason: OutlierReason | null;
}

/**
 * Preselection for the baseline list: everything is ticked except obvious outliers – Strava races
 * and sessions far longer than the rest of the same sport (above median + k × MAD and above a
 * multiple of the median, so the weekly long session stays in). Hard sessions stay ticked: they
 * are what the LTHR estimate needs. The user can override every suggestion.
 */
export function suggestSelection(activities: readonly BaselineActivity[]): SelectionSuggestion[] {
  const limits = new Map(
    SPORTS.map((sport) => [
      sport,
      upperFence(activities.filter((a) => a.sport === sport).map((a) => a.durationSec)),
    ]),
  );
  return activities.map((a) => {
    const limit = limits.get(a.sport);
    let reason: OutlierReason | null = null;
    if (a.race) reason = 'race';
    else if (limit !== undefined && a.durationSec > limit) reason = 'muchLonger';
    return { externalId: a.externalId, selected: reason === null, reason };
  });
}

/** Duration fence; undefined with too few activities to judge. */
function upperFence(xs: readonly number[]): number | undefined {
  if (xs.length < cfg.min.volume) return undefined;
  const m = median(xs) as number;
  const spread = mad(xs) as number;
  return Math.max(m + cfg.outlierMadFactor * spread, m * cfg.outlierMinFactor);
}
