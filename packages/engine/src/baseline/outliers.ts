import { planConfig } from '../plan/config';
import { mad, median } from '../stats';
import { classifyBaseline } from './classify';
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
 * and sessions far longer than the rest of the same sport AND the same kind (`classifyBaseline`):
 * long sessions are compared with long sessions, easy ones with easy ones, so the weekly long run
 * is never unticked just for being longer than the easy runs. Hard sessions stay ticked: they are
 * what the LTHR estimate needs. The user can override every suggestion.
 */
export function suggestSelection(activities: readonly BaselineActivity[]): SelectionSuggestion[] {
  const kinds = classifyBaseline(activities);
  const group = (a: BaselineActivity) => `${a.sport}|${kinds.get(a.externalId)}`;
  const durations = new Map<string, number[]>();
  for (const a of activities) {
    if (a.race) continue;
    durations.set(group(a), [...(durations.get(group(a)) ?? []), a.durationSec]);
  }
  const limits = new Map([...durations].map(([key, xs]) => [key, upperFence(xs)]));
  return activities.map((a) => {
    const limit = limits.get(group(a));
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
