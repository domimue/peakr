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
// History & performance (completed sessions; imported activities join in a later phase)

export interface HistoryEntry {
  workout: Workout;
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

function doneWorkouts(state: PlanState): Workout[] {
  return state.plan.weeks
    .flatMap((w) => w.workouts)
    .filter((w) => statusOf(state, w.id) === 'done');
}

function entryOf(w: Workout, profile: UserProfile): HistoryEntry {
  const km = workoutKm(w, profile);
  const paced = w.sport === 'run' || w.sport === 'walk';
  return {
    workout: w,
    km,
    minutes: w.durationMin,
    paceSecPerKm: paced && km > 0 ? Math.round((w.durationMin * 60) / km) : null,
  };
}

/** Completed sessions grouped by month, newest first, with month totals. */
export function historyByMonth(state: PlanState, profile: UserProfile): HistoryMonth[] {
  const byMonth = new Map<string, HistoryEntry[]>();
  const sorted = doneWorkouts(state).sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    const month = w.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), entryOf(w, profile)]);
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

function totalsOf(workouts: readonly Workout[], profile: UserProfile): Totals {
  return {
    sessions: workouts.filter((w) => w.role !== 'commute').length,
    minutes: workouts.reduce((sum, w) => sum + w.durationMin, 0),
    km: round1(workouts.reduce((sum, w) => sum + workoutKm(w, profile), 0)),
    load: round1(workouts.reduce((sum, w) => sum + w.load, 0)),
  };
}

const mondayOf = (iso: string) => {
  const d = parseIsoDate(iso) as number;
  return d - weekdayOf(d);
};

/**
 * Completed training over the `weeks` weeks up to and including the week of `today`: weekly bars
 * with the average, period and lifetime totals and personal bests.
 */
export function performance(
  state: PlanState,
  profile: UserProfile,
  today: string,
  weeks: number,
): Performance {
  const done = doneWorkouts(state);
  const last = mondayOf(today);
  const bars: PerformanceWeek[] = Array.from({ length: weeks }, (_, i) => {
    const monday = last - (weeks - 1 - i) * 7;
    const list = done.filter((w) => mondayOf(w.date) === monday);
    return { weekStart: toIsoDate(monday), ...totalsOf(list, profile) };
  });
  const inPeriod = done.filter((w) => {
    const monday = mondayOf(w.date);
    return monday >= last - (weeks - 1) * 7 && monday <= last;
  });

  const allWeeks = new Map<number, Workout[]>();
  for (const w of done)
    allWeeks.set(mondayOf(w.date), [...(allWeeks.get(mondayOf(w.date)) ?? []), w]);
  let biggestWeek: PerformanceWeek | null = null;
  for (const [monday, list] of allWeeks) {
    const week = { weekStart: toIsoDate(monday), ...totalsOf(list, profile) };
    if (!biggestWeek || week.minutes > biggestWeek.minutes) biggestWeek = week;
  }
  let longestSession: HistoryEntry | null = null;
  const longestKm: Partial<Record<Sport, number>> = {};
  for (const w of done) {
    const entry = entryOf(w, profile);
    if (!longestSession || entry.minutes > longestSession.minutes) longestSession = entry;
    for (const [sport, km] of Object.entries(workoutDistances(w, profile))) {
      const s = sport as Sport;
      longestKm[s] = Math.max(longestKm[s] ?? 0, km);
    }
  }

  return {
    weeks: bars,
    averageMinutes: Math.round(bars.reduce((sum, b) => sum + b.minutes, 0) / weeks),
    period: totalsOf(inPeriod, profile),
    lifetime: totalsOf(done, profile),
    bests: { longestSession, biggestWeek, longestKm },
  };
}
