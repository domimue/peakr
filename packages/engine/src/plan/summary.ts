import { parseIsoDate, toIsoDate, weekdayOf } from './dates';
import { workoutDistances } from './distance';
import {
  statusOf,
  weekOverrideOf,
  type PlanInput,
  type PlanState,
  type WorkoutStatus,
} from './edit';
import { travelOn } from './travel';
import type { PlanWeek, Sport, UserProfile, Workout, WorkoutColorKey, WorkoutType } from './types';

/** Figures the Today, Plan, Calendar and Progress screens show (CLAUDE.md "UI patterns"). */

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Total km of a workout over all its disciplines. */
export function workoutKm(w: Workout, profile: UserProfile): number {
  return round1(Object.values(workoutDistances(w, profile)).reduce((a, b) => a + b, 0));
}

export interface ProgressSegment {
  workoutId: string;
  date: string;
  type: WorkoutType;
  colorKey: WorkoutColorKey;
  status: WorkoutStatus;
}

export interface WeekProgress {
  /** One per training session in date order (commutes are no session of their own). */
  segments: ProgressSegment[];
  sessionsDone: number;
  sessionsPlanned: number;
  kmDone: number;
  kmPlanned: number;
  /** Planned duration of the week as ranges summed up. */
  minMin: number;
  maxMin: number;
  /** Every session is done or skipped, at least one done. */
  complete: boolean;
}

export function weekProgress(state: PlanState, week: PlanWeek, profile: UserProfile): WeekProgress {
  const sessions = week.workouts.filter((w) => w.role !== 'commute');
  const segments = sessions.map((w) => ({
    workoutId: w.id,
    date: w.date,
    type: w.type,
    colorKey: w.colorKey,
    status: statusOf(state, w.id),
  }));
  let kmDone = 0;
  let kmPlanned = 0;
  for (const w of week.workouts) {
    const status = statusOf(state, w.id);
    if (status === 'skipped') continue;
    const km = workoutKm(w, profile);
    kmPlanned += km;
    if (status === 'done') kmDone += km;
  }
  const sessionsDone = segments.filter((s) => s.status === 'done').length;
  return {
    segments,
    sessionsDone,
    sessionsPlanned: segments.filter((s) => s.status !== 'skipped').length,
    kmDone: round1(kmDone),
    kmPlanned: round1(kmPlanned),
    minMin: week.workouts.reduce((sum, w) => sum + w.duration.minMin, 0),
    maxMin: week.workouts.reduce((sum, w) => sum + w.duration.maxMin, 0),
    complete: sessionsDone > 0 && segments.every((s) => s.status !== 'planned'),
  };
}

export type WeekTag = 'recovery' | 'taper' | 'race' | 'travel' | 'different';

/** Why a week is special: recovery, taper, race week, travel, or "this week is different". */
export function weekTags(week: PlanWeek, input: PlanInput, targetDate: string | null): WeekTag[] {
  const start = parseIsoDate(week.startDate) as number;
  const dates = [0, 1, 2, 3, 4, 5, 6].map((d) => toIsoDate(start + d));
  const tags: WeekTag[] = [];
  if (week.isRecovery) tags.push('recovery');
  if (week.phase === 'taper') tags.push('taper');
  if (targetDate !== null && dates.includes(targetDate)) tags.push('race');
  if (dates.some((d) => travelOn(input.availability.travel, d) !== null)) tags.push('travel');
  if (weekOverrideOf(input, week.startDate)) tags.push('different');
  return tags;
}

// ---------------------------------------------------------------------------------------------
// History & performance: completed sessions of the current plan and, for "All time", of every
// archived plan (CLAUDE.md "Plan history"). Baseline activities are reference data and never here.

/** One plan's sessions with the profile its distances are computed with. */
export interface HistorySource {
  planId: string;
  state: PlanState;
  profile: UserProfile;
}

export interface HistoryEntry {
  workout: Workout;
  /** Plan the session belongs to (archived plans are labelled in the list). */
  planId: string;
  km: number;
  minutes: number;
  /** Average pace in s/km for runs and walks with a distance; null otherwise. */
  paceSecPerKm: number | null;
}

export interface HistoryMonth {
  /** `YYYY-MM`. */
  month: string;
  entries: HistoryEntry[];
  sessions: number;
  minutes: number;
  km: number;
}

interface DoneWorkout {
  workout: Workout;
  source: HistorySource;
}

function doneWorkouts(sources: readonly HistorySource[]): DoneWorkout[] {
  return sources.flatMap((source) =>
    source.state.plan.weeks
      .flatMap((w) => w.workouts)
      .filter((w) => statusOf(source.state, w.id) === 'done')
      .map((workout) => ({ workout, source })),
  );
}

function entryOf({ workout: w, source }: DoneWorkout): HistoryEntry {
  const km = workoutKm(w, source.profile);
  const paced = w.sport === 'run' || w.sport === 'walk';
  return {
    workout: w,
    planId: source.planId,
    km,
    minutes: w.durationMin,
    paceSecPerKm: paced && km > 0 ? Math.round((w.durationMin * 60) / km) : null,
  };
}

/** Completed sessions grouped by month, newest first, with month totals. */
export function historyByMonth(sources: readonly HistorySource[]): HistoryMonth[] {
  const byMonth = new Map<string, HistoryEntry[]>();
  const sorted = doneWorkouts(sources).sort((a, b) => b.workout.date.localeCompare(a.workout.date));
  for (const d of sorted) {
    const month = d.workout.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), entryOf(d)]);
  }
  return [...byMonth].map(([month, entries]) => ({
    month,
    entries,
    sessions: entries.filter((e) => e.workout.role !== 'commute').length,
    minutes: entries.reduce((sum, e) => sum + e.minutes, 0),
    km: round1(entries.reduce((sum, e) => sum + e.km, 0)),
  }));
}

export interface Totals {
  sessions: number;
  minutes: number;
  km: number;
  load: number;
}

export interface PerformanceWeek extends Totals {
  /** Monday of the week. */
  weekStart: string;
}

export interface PersonalBests {
  longestSession: HistoryEntry | null;
  /** Week with the most minutes. */
  biggestWeek: PerformanceWeek | null;
  /** Longest distance per discipline in one session. */
  longestKm: Partial<Record<Sport, number>>;
}

export interface Performance {
  /** One bar per week of the period, oldest first (weeks without sessions count as 0). */
  weeks: PerformanceWeek[];
  /** Average minutes per week over the period. */
  averageMinutes: number;
  period: Totals;
  lifetime: Totals;
  bests: PersonalBests;
}

function totalsOf(done: readonly DoneWorkout[]): Totals {
  return {
    sessions: done.filter((d) => d.workout.role !== 'commute').length,
    minutes: done.reduce((sum, d) => sum + d.workout.durationMin, 0),
    km: round1(done.reduce((sum, d) => sum + workoutKm(d.workout, d.source.profile), 0)),
    load: round1(done.reduce((sum, d) => sum + d.workout.load, 0)),
  };
}

const mondayOf = (iso: string) => {
  const d = parseIsoDate(iso) as number;
  return d - weekdayOf(d);
};

/**
 * Completed training of `scope` over the `weeks` weeks up to and including the week of `today`:
 * weekly bars with the average and the period totals. Personal bests and lifetime totals are
 * always over `all` (every plan ever – a best is a best whichever plan it came from).
 */
export function performance(
  scope: readonly HistorySource[],
  today: string,
  weeks: number,
  all: readonly HistorySource[] = scope,
): Performance {
  const done = doneWorkouts(scope);
  const last = mondayOf(today);
  const bars: PerformanceWeek[] = Array.from({ length: weeks }, (_, i) => {
    const monday = last - (weeks - 1 - i) * 7;
    const list = done.filter((d) => mondayOf(d.workout.date) === monday);
    return { weekStart: toIsoDate(monday), ...totalsOf(list) };
  });
  const inPeriod = done.filter((d) => {
    const monday = mondayOf(d.workout.date);
    return monday >= last - (weeks - 1) * 7 && monday <= last;
  });

  const ever = doneWorkouts(all);
  const allWeeks = new Map<number, DoneWorkout[]>();
  for (const d of ever) {
    const monday = mondayOf(d.workout.date);
    allWeeks.set(monday, [...(allWeeks.get(monday) ?? []), d]);
  }
  let biggestWeek: PerformanceWeek | null = null;
  for (const [monday, list] of allWeeks) {
    const week = { weekStart: toIsoDate(monday), ...totalsOf(list) };
    if (!biggestWeek || week.minutes > biggestWeek.minutes) biggestWeek = week;
  }
  let longestSession: HistoryEntry | null = null;
  const longestKm: Partial<Record<Sport, number>> = {};
  for (const d of ever) {
    const entry = entryOf(d);
    if (!longestSession || entry.minutes > longestSession.minutes) longestSession = entry;
    for (const [sport, km] of Object.entries(workoutDistances(d.workout, d.source.profile))) {
      const s = sport as Sport;
      longestKm[s] = Math.max(longestKm[s] ?? 0, km);
    }
  }

  return {
    weeks: bars,
    averageMinutes: Math.round(bars.reduce((sum, b) => sum + b.minutes, 0) / weeks),
    period: totalsOf(inPeriod),
    lifetime: totalsOf(ever),
    bests: { longestSession, biggestWeek, longestKm },
  };
}
