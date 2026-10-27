import {
  absorbActivity,
  activityKeys,
  dedupeActivities,
  isSameActivity,
  matchActivities,
  planRange,
  setWorkoutStatus,
  statusOf,
  workoutDistances,
  type Activity,
  type ActivityLink,
  type ActivitySource,
  type GymSession,
  type HrZone,
  type ImportedSport,
  type MatchQuestion,
  type PlanState,
  type SourceRef,
} from '@peakr/engine';

import { planTargetBands } from '@/features/training-zones/resolve';

import type { StoredActivity } from '../repositories/activity-repository';
import type { StoredPlan } from '../repositories/plan-repository';

/**
 * What new activities do to the plan (CLAUDE.md "After import"), as a pure function over the
 * stored plan and the activity rows: records of the same workout are merged, each new activity is
 * matched to its planned workout (marked done) or – if unplanned – counts towards the week's load
 * and rebalances the rest of the week. Every activity is handled once.
 */

export interface ActivityNotice {
  /** `question`: Peakr was not sure which planned workout it was – the user picks. */
  kind: 'matched' | 'unplanned' | 'question';
  sport: ImportedSport;
  source: ActivitySource;
  date: string;
  /** Matched: the workout marked done. */
  workoutId?: string;
  /** Matched: the activity, so the link can be undone. */
  activityKey?: string;
  /** Matched: the workout was already marked done by hand (undo leaves it done). */
  wasDone?: boolean;
  /** Unplanned: sessions made shorter / easier. */
  adjusted: number;
}

export interface ImportOutcome {
  /** The new plan state, or null when nothing in the plan changed. */
  state: PlanState | null;
  links: ActivityLink[];
  /** Not confident: ask the user (stored until answered). */
  questions: (MatchQuestion & { activity: Activity })[];
  /** Source records that are now handled. */
  handled: SourceRef[];
  notices: ActivityNotice[];
}

/** Planned distance of a workout for the activity's sport, for the match score. */
export function plannedKmFor(stored: StoredPlan) {
  return (w: Parameters<typeof workoutDistances>[0], a: Activity): number | null => {
    const km = workoutDistances(w, stored.input.profile)[
      a.sport as keyof ReturnType<typeof workoutDistances>
    ];
    return km !== undefined && km > 0 ? km : null;
  };
}

/** The plan's heart rate zones (manual zones included) for the load of imported activities. */
export function hrZonesOf(stored: StoredPlan): HrZone[] {
  return planTargetBands(stored.input);
}

/**
 * A strength activity from Strava or a watch that is a gym session logged in Peakr (e.g. posted to
 * Strava afterwards). The detailed gym session already counted (WORKOUTS.md §8.7), so the import
 * must not count it again.
 */
export function isLoggedGymSession(a: Activity, sessions: readonly GymSession[]): boolean {
  if (a.sport !== 'strength') return false;
  return sessions.some((s) => {
    const minutes = s.durationMin ?? Math.round(((s.endedAt ?? s.startedAt) - s.startedAt) / 60000);
    return isSameActivity(a, {
      sport: 'strength',
      startTime: new Date(s.startedAt).toISOString(),
      durationSec: minutes * 60,
    });
  });
}

export function applyImportedActivities(
  stored: StoredPlan | null,
  records: readonly StoredActivity[],
  links: readonly (ActivityLink & { planId: string })[],
  today: string,
  gymSessions: readonly GymSession[] = [],
): ImportOutcome {
  const none: ImportOutcome = { state: null, links: [], questions: [], handled: [], notices: [] };
  // Without a plan there is nothing to adapt yet; the activities wait.
  if (!stored) return none;

  const handledKeys = new Set(
    records.filter((r) => r.handled).map((r) => `${r.source}:${r.externalId}`),
  );
  const merged = dedupeActivities(records);
  // A new record of an activity that was already handled (e.g. Garmin after Strava) is not new.
  const fresh = merged.filter(
    (a) => !activityKeys(a).some((k) => handledKeys.has(k)) && !isLoggedGymSession(a, gymSessions),
  );
  const handled = merged
    .filter((a) => a.sources.some((s) => !handledKeys.has(`${s.source}:${s.externalId}`)))
    .flatMap((a) => a.sources);
  if (fresh.length === 0) return { ...none, handled };

  const linkedKeys = new Set(links.map((l) => l.activityKey));
  const linkedWorkouts = new Set(
    links.filter((l) => l.planId === stored.id).map((l) => l.workoutId),
  );
  const {
    links: newLinks,
    questions,
    unplanned,
  } = matchActivities(stored.state, fresh, linkedKeys, linkedWorkouts, plannedKmFor(stored));
  const range = planRange(stored.state.plan);
  const inPlan = (date: string) => date >= range.first && date <= range.last;

  let state = stored.state;
  let changed = false;
  const notices: ActivityNotice[] = [];
  for (const link of newLinks) {
    const a = fresh.find((x) => x.key === link.activityKey);
    /* istanbul ignore next -- links come from `fresh` */
    if (!a) continue;
    const wasDone = statusOf(state, link.workoutId) === 'done';
    if (!wasDone) {
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
      activityKey: a.key,
      wasDone,
      adjusted: 0,
    });
  }

  // Unsure: nothing changes until the user says which workout it was (or none of them).
  const asked = questions.flatMap((q) => {
    const activity = fresh.find((x) => x.key === q.activityKey);
    return activity ? [{ ...q, activity }] : [];
  });
  for (const q of asked) {
    notices.push({
      kind: 'question',
      sport: q.activity.sport,
      source: q.activity.source,
      date: q.activity.date,
      activityKey: q.activityKey,
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
  return { state: changed ? state : null, links: newLinks, questions: asked, handled, notices };
}
