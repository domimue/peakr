import {
  absorbActivity,
  activityKeys,
  calculateHrZones,
  dedupeActivities,
  matchActivities,
  planRange,
  setWorkoutStatus,
  statusOf,
  type ActivityLink,
  type ActivitySource,
  type HrZone,
  type ImportedSport,
  type PlanState,
  type SourceRef,
} from '@peakr/engine';

import type { StoredActivity } from '../repositories/activity-repository';
import type { StoredPlan } from '../repositories/plan-repository';

/**
 * What new activities do to the plan (CLAUDE.md "After import"), as a pure function over the
 * stored plan and the activity rows: records of the same workout are merged, each new activity is
 * matched to its planned workout (marked done) or – if unplanned – counts towards the week's load
 * and rebalances the rest of the week. Every activity is handled once.
 */

export interface ActivityNotice {
  kind: 'matched' | 'unplanned';
  sport: ImportedSport;
  source: ActivitySource;
  date: string;
  /** Matched: the workout marked done. */
  workoutId?: string;
  /** Unplanned: sessions made shorter / easier. */
  adjusted: number;
}

export interface ImportOutcome {
  /** The new plan state, or null when nothing in the plan changed. */
  state: PlanState | null;
  links: ActivityLink[];
  /** Source records that are now handled. */
  handled: SourceRef[];
  notices: ActivityNotice[];
}

export function hrZonesOf(stored: StoredPlan): HrZone[] {
  const input = stored.input.hrZones;
  if (!input) return [];
  const zones = calculateHrZones(input);
  return zones.ok ? zones.value.zones : [];
}

export function applyImportedActivities(
  stored: StoredPlan | null,
  records: readonly StoredActivity[],
  links: readonly (ActivityLink & { planId: string })[],
  today: string,
): ImportOutcome {
  const none: ImportOutcome = { state: null, links: [], handled: [], notices: [] };
  // Without a plan there is nothing to adapt yet; the activities wait.
  if (!stored) return none;

  const handledKeys = new Set(
    records.filter((r) => r.handled).map((r) => `${r.source}:${r.externalId}`),
  );
  const merged = dedupeActivities(records);
  // A new record of an activity that was already handled (e.g. Garmin after Strava) is not new.
  const fresh = merged.filter((a) => !activityKeys(a).some((k) => handledKeys.has(k)));
  const handled = merged
    .filter((a) => a.sources.some((s) => !handledKeys.has(`${s.source}:${s.externalId}`)))
    .flatMap((a) => a.sources);
  if (fresh.length === 0) return { ...none, handled };

  const linkedKeys = new Set(links.map((l) => l.activityKey));
  const linkedWorkouts = new Set(
    links.filter((l) => l.planId === stored.id).map((l) => l.workoutId),
  );
  const { links: newLinks, unplanned } = matchActivities(
    stored.state,
    fresh,
    linkedKeys,
    linkedWorkouts,
  );
  const range = planRange(stored.state.plan);
  const inPlan = (date: string) => date >= range.first && date <= range.last;

  let state = stored.state;
  let changed = false;
  const notices: ActivityNotice[] = [];
  for (const link of newLinks) {
    const a = fresh.find((x) => x.key === link.activityKey);
    /* istanbul ignore next -- links come from `fresh` */
    if (!a) continue;
    if (statusOf(state, link.workoutId) !== 'done') {
      const result = setWorkoutStatus(state, link.workoutId, 'done');
      if (result.ok) {
        state = result.value;
        changed = true;
      }
    }
    notices.push({
      kind: 'matched',
      sport: a.sport,
      source: a.source,
      date: a.date,
      workoutId: link.workoutId,
      adjusted: 0,
    });
  }

  const zones = hrZonesOf(stored);
  for (const a of unplanned) {
    if (!inPlan(a.date)) continue;
    const result = absorbActivity(state, stored.input, a, zones, today);
    if (result.state !== state) {
      state = result.state;
      changed = true;
    }
    notices.push({
      kind: 'unplanned',
      sport: a.sport,
      source: a.source,
      date: a.date,
      adjusted: result.shortened.length + result.eased.length,
    });
  }
  return { state: changed ? state : null, links: newLinks, handled, notices };
}
