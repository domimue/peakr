import { parseIsoDate, toIsoDate, weekdayOf } from '../plan/dates';
import {
  MUSCLE_GROUPS,
  resolveExercise,
  type CustomExercise,
  type MuscleGroup,
} from '../plan/library';
import { countsAsWork, setOneRepMax } from './records';
import { sessionDurationMin, summarizeSession, type SessionSummary } from './summary';
import type { GymSession, GymSet } from './types';

/**
 * Gym statistics (CLAUDE.md "Gym": history, personal records and volume statistics per exercise
 * and per muscle group). Weeks start on Monday; dates are the sessions' local calendar days.
 */

export const gymStatsConfig = {
  /** Weekly working sets per muscle group that count as a productive range (primary 1, secondary 0.5). */
  setTargets: {
    major: { min: 10, max: 20 },
    minor: { min: 4, max: 12 },
  },
  /** Small muscles trained mostly indirectly. */
  minorMuscles: [
    'forearms',
    'neck',
    'shins',
    'hip_flexors',
    'adductors',
    'abductors',
    'obliques',
  ] as readonly MuscleGroup[],
  secondaryShare: 0.5,
} as const;

export interface SetBand {
  min: number;
  max: number;
}

export function muscleSetTarget(muscle: MuscleGroup): SetBand {
  return gymStatsConfig.minorMuscles.includes(muscle)
    ? gymStatsConfig.setTargets.minor
    : gymStatsConfig.setTargets.major;
}

/** Monday of the week of an ISO date. */
export function weekStartOf(date: string): string {
  const day = parseIsoDate(date);
  if (day === null) throw new Error(`not a date: ${date}`);
  return toIsoDate(day - weekdayOf(day));
}

/** The Mondays of the last `count` weeks up to the week of `today`, oldest first. */
export function recentWeeks(today: string, count: number): string[] {
  const monday = parseIsoDate(weekStartOf(today)) as number;
  return Array.from({ length: count }, (_, i) => toIsoDate(monday - (count - 1 - i) * 7));
}

export type MuscleSets = Partial<Record<MuscleGroup, number>>;

/** Working sets per muscle group: primary muscles 1, secondary 0.5. */
export function muscleSets(
  sets: readonly GymSet[],
  custom: readonly CustomExercise[] = [],
): MuscleSets {
  const out: MuscleSets = {};
  for (const set of sets) {
    if (!countsAsWork(set)) continue;
    const exercise = resolveExercise(set.exerciseId, custom);
    if (!exercise) continue;
    for (const m of exercise.primaryMuscles) out[m] = (out[m] ?? 0) + 1;
    for (const m of exercise.secondaryMuscles) {
      out[m] = (out[m] ?? 0) + gymStatsConfig.secondaryShare;
    }
  }
  return out;
}

export interface GymWeek {
  /** Monday. */
  weekStart: string;
  sessions: number;
  /** Working sets. */
  sets: number;
  volumeKg: number;
  durationMin: number;
  muscles: MuscleSets;
}

/** One entry per week in `weeks` (Mondays), empty weeks included. */
export function weeklyStats(
  sessions: readonly GymSession[],
  sets: readonly GymSet[],
  weeks: readonly string[],
  custom: readonly CustomExercise[] = [],
): GymWeek[] {
  const bySession = groupSets(sets);
  return weeks.map((weekStart) => {
    const inWeek = sessions.filter((s) => weekStartOf(s.date) === weekStart);
    const weekSets = inWeek.flatMap((s) => bySession.get(s.id) ?? []);
    const work = weekSets.filter(countsAsWork);
    return {
      weekStart,
      sessions: inWeek.length,
      sets: work.length,
      volumeKg: round1(work.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0)),
      durationMin: inWeek.reduce(
        (sum, s) => sum + sessionDurationMin(s, bySession.get(s.id) ?? []),
        0,
      ),
      muscles: muscleSets(weekSets, custom),
    };
  });
}

/** Average sessions per week over the given weeks. */
export function trainingFrequency(weeks: readonly GymWeek[]): number {
  if (weeks.length === 0) return 0;
  return round1(weeks.reduce((sum, w) => sum + w.sessions, 0) / weeks.length);
}

export interface MuscleShade {
  muscle: MuscleGroup;
  sets: number;
  band: SetBand;
  /** 0 = not trained, 1 = reached the lower end of the target band. */
  shade: number;
  status: 'none' | 'below' | 'within' | 'above';
}

/** Every muscle group with its sets and shade (body map and the list next to it). */
export function muscleShades(muscles: MuscleSets): MuscleShade[] {
  return MUSCLE_GROUPS.map((muscle) => {
    const sets = muscles[muscle] ?? 0;
    const band = muscleSetTarget(muscle);
    const status =
      sets === 0 ? 'none' : sets < band.min ? 'below' : sets > band.max ? 'above' : 'within';
    return { muscle, sets, band, shade: Math.min(1, sets / band.min), status };
  });
}

export interface GymHistoryEntry {
  session: GymSession;
  summary: SessionSummary;
}

export interface GymHistoryMonth {
  /** `YYYY-MM`. */
  month: string;
  entries: GymHistoryEntry[];
  sessions: number;
  volumeKg: number;
  durationMin: number;
}

/** Sessions grouped by month, most recent first, with month totals. */
export function gymHistoryByMonth(
  sessions: readonly GymSession[],
  sets: readonly GymSet[],
  custom: readonly CustomExercise[] = [],
): GymHistoryMonth[] {
  const bySession = groupSets(sets);
  const months = new Map<string, GymHistoryEntry[]>();
  const ordered = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  for (const session of ordered) {
    const month = session.date.slice(0, 7);
    // Records are not needed in the list; the history argument stays empty.
    const summary = summarizeSession(session, bySession.get(session.id) ?? [], [], custom);
    months.set(month, [...(months.get(month) ?? []), { session, summary }]);
  }
  return [...months.entries()].map(([month, entries]) => ({
    month,
    entries,
    sessions: entries.length,
    volumeKg: round1(entries.reduce((sum, e) => sum + e.summary.volumeKg, 0)),
    durationMin: entries.reduce((sum, e) => sum + e.summary.durationMin, 0),
  }));
}

export interface ExercisePoint {
  sessionId: string;
  date: string;
  /** Best Epley estimate of the session (sets up to 12 reps). */
  oneRm?: number;
  /** Heaviest completed working set. */
  heaviestKg?: number;
  volumeKg: number;
  /** Every set of the exercise in that session, warm-ups included, in order. */
  sets: GymSet[];
}

/** Per session that has the exercise, oldest first (charts and the list of past sets). */
export function exerciseTimeline(
  exerciseId: string,
  sessions: readonly GymSession[],
  sets: readonly GymSet[],
): ExercisePoint[] {
  const own = groupSets(sets.filter((s) => s.exerciseId === exerciseId && s.completed));
  return [...sessions]
    .filter((s) => own.has(s.id))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((session) => {
      const list = own.get(session.id) as GymSet[];
      const work = list.filter(countsAsWork);
      const oneRms = work.flatMap((s) => {
        const v = setOneRepMax(s);
        return v === undefined ? [] : [v];
      });
      const weights = work.flatMap((s) => (s.weightKg ? [s.weightKg] : []));
      return {
        sessionId: session.id,
        date: session.date,
        ...(oneRms.length > 0 ? { oneRm: round1(Math.max(...oneRms)) } : {}),
        ...(weights.length > 0 ? { heaviestKg: Math.max(...weights) } : {}),
        volumeKg: round1(work.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0)),
        sets: list,
      };
    });
}

function groupSets(sets: readonly GymSet[]): Map<string, GymSet[]> {
  const out = new Map<string, GymSet[]>();
  for (const s of sets) out.set(s.sessionId, [...(out.get(s.sessionId) ?? []), s]);
  for (const list of out.values()) list.sort((a, b) => a.setIndex - b.setIndex);
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
