import { assertDefined, type ValidationCode } from '../result';
import { isHardOnItsOwn } from './classify';
import { planConfig } from './config';
import { parseIsoDate, toIsoDate, weekdayOf } from './dates';
import { classifyPlan, generatePlan, type PlanField } from './generate';
import { getTemplate } from './library';
import { deloadSets, levelAfterPause } from './levels';
import { round1, strengthLoad } from './load';
import { athleteFor, exerciseLegLoad, materialize } from './materialize';
import { isRaceGoal } from './periodisation';
import type { NextDay, PrevDay } from './scheduler';
import type {
  Availability,
  Experience,
  Goal,
  LegLoad,
  Plan,
  PlanNote,
  PlanWeek,
  Sport,
  TravelPeriod,
  UserProfile,
  WeekOverride,
  Workout,
} from './types';

/**
 * Editing a generated plan (CLAUDE.md "Editing", "Pause"): move with week rebalance, make a
 * session easier, mark done / skipped, pause and resume, regenerate the remaining weeks.
 * Every function is pure: it takes a `PlanState` and returns a new one.
 */

const cfg = planConfig.edit;

export type WorkoutStatus = 'planned' | 'done' | 'skipped';
export type PauseReason = 'illness' | 'injury' | 'holiday';

export interface PlanPause {
  reason: PauseReason;
  /** First paused day. */
  startDate: string;
  /** First training day after the pause; null while the pause is running. */
  endDate: string | null;
}

/** What `generatePlan` was called with – needed to rebuild parts of the plan. */
export interface PlanInput {
  profile: UserProfile;
  goal: Goal;
  availability: Availability;
  targetDate?: string;
}

export interface PlanState {
  plan: Plan;
  /** Status per workout id; missing means planned. */
  status: Readonly<Record<string, WorkoutStatus>>;
  pauses: readonly PlanPause[];
  /** Number of regenerations so far (keeps new workout ids unique). */
  revision: number;
}

export type EditField = PlanField | 'workout' | 'date' | 'pause';

/** Why an edit was refused (plus the `generatePlan` codes when a rebuild fails). */
export type EditCode = 'notFound' | 'outsidePlan' | 'paused' | 'notPaused';

export interface EditIssue {
  field: EditField;
  code: ValidationCode | EditCode;
  params?: Readonly<Record<string, number>>;
}

export type EditResult<T> = { ok: true; value: T } | { ok: false; issues: EditIssue[] };

export type RuleCode = keyof typeof cfg.ruleWeights;

/** A broken scheduling rule; the UI explains it and lets the user keep it anyway. */
export interface RuleViolation {
  code: RuleCode;
  dates: string[];
  workoutIds: string[];
}

/** Not a rule, but worth a hint: moved onto a past day or into a pause. */
export type MoveNoticeCode = 'pastDay' | 'pausedDay';

export interface MoveWarning {
  code: RuleCode | MoveNoticeCode;
  dates: string[];
  workoutIds: string[];
  /** Hard sessions next to the moved one that "make the other day easier" can convert. */
  easeable: string[];
}

/** Other sessions the engine would move to keep the week balanced – applied only if the user wants. */
export interface RebalanceSuggestion {
  moves: { id: string; from: string; to: string }[];
  /** The plan with the user's move and these moves. */
  state: PlanState;
}

export interface MoveResult {
  /** The plan with exactly the user's move – the calendar is freely plannable. */
  state: PlanState;
  /** Dismissible hints about broken rules (and past / paused days). */
  warnings: MoveWarning[];
  suggestion: RebalanceSuggestion | null;
}

const fail = <T>(field: EditField, code: EditIssue['code']): EditResult<T> => ({
  ok: false,
  issues: [{ field, code }],
});

const day = (iso: string): number => parseIsoDate(iso) as number;

export function newPlanState(plan: Plan): PlanState {
  return { plan, status: {}, pauses: [], revision: 0 };
}

export function statusOf(state: PlanState, id: string): WorkoutStatus {
  return state.status[id] ?? 'planned';
}

export function allWorkouts(plan: Plan): Workout[] {
  return plan.weeks.flatMap((w) => w.workouts);
}

export function findWorkout(plan: Plan, id: string): Workout | undefined {
  return allWorkouts(plan).find((w) => w.id === id);
}

/** First and last training day of the plan (race goals end the day before the race). */
export function planRange(plan: Plan): { first: string; last: string } {
  const lastWeek = assertDefined(plan.weeks[plan.weeks.length - 1], 'week');
  let last = day(lastWeek.startDate) + 6;
  if (plan.targetDate !== null) {
    const target = day(plan.targetDate);
    last = Math.min(last, isRaceGoal(plan.goal.kind) ? target - 1 : target);
  }
  return { first: plan.startDate, last: toIsoDate(last) };
}

/** The running pause, if any. */
export function activePause(state: PlanState): PlanPause | null {
  return state.pauses.find((p) => p.endDate === null) ?? null;
}

/** True if the date lies inside a pause (running pauses cover every later day). */
export function isPaused(state: PlanState, date: string): boolean {
  return state.pauses.some((p) => date >= p.startDate && (p.endDate === null || date < p.endDate));
}

/**
 * Full details (steps, targets) only for the current week and the next 3; later weeks show the
 * outline (CLAUDE.md "Look-ahead").
 */
export function inDetailWindow(date: string, today: string): boolean {
  const t = day(today);
  const monday = t - weekdayOf(t);
  return day(date) < monday + planConfig.lookAhead.weeks * 7;
}

// ---------------------------------------------------------------------------------------------
// Rules

/** Hard for spacing – like the scheduler: §11, and `moderate` for beginners. */
function hardForSpacing(w: Workout, experience: Experience): boolean {
  return isHardOnItsOwn(w) || (experience === 'beginner' && w.intensity === 'moderate');
}

const isLongOrKey = (w: Workout) => ['long', 'key', 'brick', 'benchmark'].includes(w.role);
const isHeavyLegs = (w: Workout) => w.sport === 'strength' && w.legLoad === 'heavy';

/**
 * Rules broken by these workouts (CLAUDE.md "Scheduling", WORKOUTS.md §8.3, §11). Pass only
 * workouts that count – skipped ones are left out by `activeWorkouts`.
 */
export function findViolations(
  workouts: readonly Workout[],
  availability: Availability,
  experience: Experience,
): RuleViolation[] {
  const byDay = new Map<number, Workout[]>();
  for (const w of workouts) {
    const d = day(w.date);
    byDay.set(d, [...(byDay.get(d) ?? []), w]);
  }
  const out: RuleViolation[] = [];
  const maxPerDay = availability.doublesAllowed ? 2 : 1;
  const days = [...byDay.keys()].sort((a, b) => a - b);
  for (const d of days) {
    const list = byDay.get(d) as Workout[];
    const date = toIsoDate(d);
    const ids = list.map((w) => w.id);
    // Commutes are transport: they never count as one of the day's sessions.
    const sessions = list.filter((w) => w.commuteId === undefined);
    if (sessions.length > maxPerDay)
      out.push({ code: 'tooManySessions', dates: [date], workoutIds: sessions.map((w) => w.id) });
    const sports = sessions.map((w) => w.sport);
    if (new Set(sports).size < sports.length) {
      const dupes = sessions.filter((w) => sports.filter((s) => s === w.sport).length > 1);
      out.push({ code: 'sameSportOneDay', dates: [date], workoutIds: dupes.map((w) => w.id) });
    }
    const hard = list.filter((w) => hardForSpacing(w, experience));
    const hardEndurance = hard.filter((w) => w.sport !== 'strength');
    if (hardEndurance.length > 1) {
      out.push({
        code: 'twoHardOneDay',
        dates: [date],
        workoutIds: hardEndurance.map((w) => w.id),
      });
    }
    const minutes = list.reduce((sum, w) => sum + w.durationMin, 0);
    if (minutes > availableMinutes(availability, d)) {
      out.push({ code: 'overAvailability', dates: [date], workoutIds: ids });
    }

    const next = byDay.get(d + 1) ?? [];
    const nextDate = toIsoDate(d + 1);
    const nextHard = next.filter((w) => hardForSpacing(w, experience));
    if (hard.length > 0 && nextHard.length > 0) {
      out.push({
        code: 'backToBackHard',
        dates: [date, nextDate],
        workoutIds: [...hard, ...nextHard].map((w) => w.id),
      });
    }
    const heavy = list.filter(isHeavyLegs);
    const key = next.filter(isLongOrKey);
    if (heavy.length > 0 && key.length > 0) {
      out.push({
        code: 'heavyLegsBeforeKey',
        dates: [date, nextDate],
        workoutIds: [...heavy, ...key].map((w) => w.id),
      });
    }
    const descent = list.filter((w) => w.terrain?.eccentric === true);
    const heavyNext = next.filter(isHeavyLegs);
    if (descent.length > 0 && heavyNext.length > 0) {
      out.push({
        code: 'heavyLegsAfterDescent',
        dates: [date, nextDate],
        workoutIds: [...descent, ...heavyNext].map((w) => w.id),
      });
    }
  }
  return out;
}

/** Minutes available on a day: the week override if there is one, else the normal week. */
function availableMinutes(availability: Availability, d: number): number {
  const iso = toIsoDate(d);
  const monday = toIsoDate(d - weekdayOf(d));
  const override = availability.weekOverrides?.find((o) => o.weekStart === monday);
  if (override?.blockedDates?.includes(iso)) return 0;
  const minutes = override?.minutesPerDay ?? availability.minutesPerDay;
  return minutes[weekdayOf(d)];
}

/** Workouts that count for the rules and the load: everything except skipped ones. */
export function activeWorkouts(state: PlanState): Workout[] {
  return allWorkouts(state.plan).filter((w) => statusOf(state, w.id) !== 'skipped');
}

function score(violations: readonly RuleViolation[]): number {
  return violations.reduce((sum, v) => sum + cfg.ruleWeights[v.code], 0);
}

// ---------------------------------------------------------------------------------------------
// Plan rebuilding helpers

/** Puts workouts back into their weeks (by date), recomputes week totals and the §11 flags. */
function rebuild(plan: Plan, workouts: readonly Workout[], experience: Experience): Plan {
  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  const weeks: PlanWeek[] = plan.weeks.map((w) => {
    const start = day(w.startDate);
    const list = sorted.filter((x) => {
      const d = day(x.date);
      return d >= start && d < start + 7;
    });
    return {
      ...w,
      workouts: list,
      load: round1(list.reduce((sum, x) => sum + x.load, 0)),
      minutes: list.reduce((sum, x) => sum + x.durationMin, 0),
    };
  });
  return { ...plan, weeks: classifyPlan(weeks, experience) };
}

function relocate(w: Workout, date: string): Workout {
  return { ...w, date, weekday: weekdayOf(day(date)) };
}

/** A workout the user or the engine may still change: planned, not in the past, not paused. */
function movable(state: PlanState, w: Workout, today: string): boolean {
  return statusOf(state, w.id) === 'planned' && w.date >= today && !isPaused(state, w.date);
}

// ---------------------------------------------------------------------------------------------
// Move

/**
 * Moves a workout to any day of the plan – also done workouts, past days and paused days: the user
 * decides, the engine only warns. Broken rules come back as dismissible warnings, and a rebalance
 * of the affected weeks (other planned sessions moved, load unchanged, e.g. a swap when the target
 * day is taken) comes back as a suggestion the user can apply.
 */
export function moveWorkout(
  state: PlanState,
  workoutId: string,
  toDate: string,
  input: PlanInput,
  today: string,
): EditResult<MoveResult> {
  const workout = findWorkout(state.plan, workoutId);
  if (!workout) return fail('workout', 'notFound');
  if (parseIsoDate(toDate) === null) return fail('date', 'invalidDate');
  const range = planRange(state.plan);
  if (toDate < range.first || toDate > range.last) return fail('date', 'outsidePlan');

  const { availability, profile } = input;
  const experience = profile.experience;
  const from = workout.date;
  const moved = allWorkouts(state.plan).map((w) => (w.id === workoutId ? relocate(w, toDate) : w));

  const counted = (list: readonly Workout[]) =>
    list.filter((w) => statusOf(state, w.id) !== 'skipped');
  const violationsOf = (list: readonly Workout[]) =>
    findViolations(counted(list), availability, experience);

  // Rebalance suggestion: only planned future sessions, only free days of the affected weeks.
  const weekStarts = new Set([from, toDate].map((d) => day(d) - weekdayOf(day(d))));
  const allowedDays = [...weekStarts]
    .flatMap((m) => [0, 1, 2, 3, 4, 5, 6].map((o) => toIsoDate(m + o)))
    .filter((d) => d >= today && d >= range.first && d <= range.last && !isPaused(state, d));
  const sameWeek = (a: string, b: string) =>
    day(a) - weekdayOf(day(a)) === day(b) - weekdayOf(day(b));
  let workouts = moved;
  for (let step = 0; step < cfg.maxRebalanceMoves; step++) {
    const current = score(violationsOf(workouts));
    if (current === 0) break;
    const involved = new Set(violationsOf(workouts).flatMap((v) => v.workoutIds));
    let best: { list: Workout[]; score: number } | null = null;
    for (const w of workouts) {
      if (w.id === workoutId || !involved.has(w.id) || !movable(state, w, today)) continue;
      // The day the user's workout came from first (a swap), then the nearest days.
      const candidates = allowedDays
        .filter((d) => d !== w.date && sameWeek(d, w.date))
        .sort(
          (a, b) =>
            Number(b === from) - Number(a === from) ||
            Math.abs(day(a) - day(w.date)) - Math.abs(day(b) - day(w.date)),
        );
      for (const d of candidates) {
        const list = workouts.map((x) => (x.id === w.id ? relocate(x, d) : x));
        const s = score(violationsOf(list));
        if (s < current && (!best || s < best.score)) best = { list, score: s };
      }
    }
    if (!best) break;
    workouts = best.list;
  }
  const originalDate = new Map(allWorkouts(state.plan).map((w) => [w.id, w.date]));
  const moves = workouts
    .filter((w) => w.id !== workoutId && originalDate.get(w.id) !== w.date)
    .map((w) => ({ id: w.id, from: originalDate.get(w.id) as string, to: w.date }));
  const suggestion: RebalanceSuggestion | null =
    moves.length === 0
      ? null
      : { moves, state: { ...state, plan: rebuild(state.plan, workouts, experience) } };

  const plan = rebuild(state.plan, moved, experience);
  const next: PlanState = { ...state, plan };
  const warnings: MoveWarning[] = violationsOf(allWorkouts(plan))
    .filter((v) => v.workoutIds.includes(workoutId))
    .map((v) => ({
      ...v,
      easeable:
        v.code === 'backToBackHard' || v.code === 'twoHardOneDay'
          ? v.workoutIds.filter((id) => {
              const w = findWorkout(plan, id);
              return id !== workoutId && w !== undefined && movable(next, w, today);
            })
          : [],
    }));
  const notice = (code: MoveNoticeCode): MoveWarning => ({
    code,
    dates: [toDate],
    workoutIds: [workoutId],
    easeable: [],
  });
  if (toDate < today) warnings.unshift(notice('pastDay'));
  if (isPaused(state, toDate)) warnings.unshift(notice('pausedDay'));
  return { ok: true, value: { state: next, warnings, suggestion } };
}

// ---------------------------------------------------------------------------------------------
// Ease ("make the other day easier")

const EASY_TEMPLATE: Record<Sport | 'brick', { normal: string; long: string }> = {
  run: { normal: 'run.easy', long: 'run.long' },
  bike: { normal: 'bike.endurance', long: 'bike.long' },
  swim: { normal: 'swim.easy', long: 'swim.easy' },
  brick: { normal: 'bike.endurance', long: 'bike.endurance' },
};

const EASED_LEG_LOAD: Record<LegLoad, LegLoad> = { heavy: 'light', light: 'light', none: 'none' };

/**
 * Turns a hard session into an easy one of the same sport and length (strength: the heavy leg
 * exercises are deloaded). The week loses a little load – easier is the point.
 */
export function easeWorkout(
  state: PlanState,
  workoutId: string,
  input: PlanInput,
): EditResult<PlanState> {
  const w = findWorkout(state.plan, workoutId);
  if (!w) return fail('workout', 'notFound');
  const note: PlanNote = { key: 'notes.eased', params: { type: w.type } };

  let eased: Workout;
  if (w.sport === 'strength') {
    const planned = assertDefined(w.exercises, 'exercises');
    const exercises = planned.map((e) =>
      exerciseLegLoad(e.exerciseId) === 'heavy' ? { ...e, sets: deloadSets(e.sets) } : e,
    );
    const sets = (list: typeof planned) => list.reduce((sum, e) => sum + e.sets, 0);
    const durationMin = Math.max(
      planConfig.plan.minSessionMin,
      Math.round((w.durationMin * sets(exercises)) / Math.max(1, sets(planned))),
    );
    const rpe = Math.min(...exercises.map((e) => e.rpe), cfg.easedStrengthMaxRpe);
    eased = {
      ...w,
      exercises,
      durationMin,
      legLoad: EASED_LEG_LOAD[w.legLoad],
      intensity: 'easy',
      load: round1(strengthLoad(durationMin, rpe)),
      notes: [...w.notes, note],
    };
  } else {
    // Plan workouts are always run / bike / swim / brick (winter sports are only variants).
    const sport = w.sport as Sport | 'brick';
    const long = w.role === 'long';
    const template = getTemplate(long ? EASY_TEMPLATE[sport].long : EASY_TEMPLATE[sport].normal);
    const athlete = athleteFor(input.profile, input.goal.kind);
    const m = materialize(
      template,
      null,
      w.durationMin,
      long ? 'long' : 'easy',
      athlete,
      w.durationMin,
    );
    eased = {
      ...w,
      sport: template.sport,
      templateId: template.id,
      type: template.type,
      role: long ? 'long' : 'easy',
      intensity: template.intensity,
      level: null,
      durationMin: m.durationMin,
      load: m.load,
      legLoad: template.legLoad,
      target: m.target,
      warmup: m.warmup,
      main: m.main,
      cooldown: m.cooldown,
      terrain: m.terrain,
      exercises: null,
      whyKey: template.whyKey,
      notes: [...w.notes, note],
      /* v8 ignore next -- every easy template has an indoor alternative */
      indoorAlternativeId: template.indoorAlternativeId ?? null,
      winterVariant: null,
    };
  }
  const workouts = allWorkouts(state.plan).map((x) => (x.id === workoutId ? eased : x));
  return {
    ok: true,
    value: { ...state, plan: rebuild(state.plan, workouts, input.profile.experience) },
  };
}

// ---------------------------------------------------------------------------------------------
// Done / skipped

/** Done, skipped or back to planned – any workout, any day (the user decides). */
export function setWorkoutStatus(
  state: PlanState,
  workoutId: string,
  status: WorkoutStatus,
): EditResult<PlanState> {
  const w = findWorkout(state.plan, workoutId);
  if (!w) return fail('workout', 'notFound');
  const next = Object.fromEntries(Object.entries(state.status).filter(([id]) => id !== workoutId));
  if (status !== 'planned') next[workoutId] = status;
  return { ok: true, value: { ...state, status: next } };
}

// ---------------------------------------------------------------------------------------------
// Regenerate (new availability, resume)

/** First day a regeneration may replace: today, or tomorrow if something was done today. */
export function regenerationStart(state: PlanState, today: string): string {
  const doneToday = allWorkouts(state.plan).some(
    (w) => w.date === today && statusOf(state, w.id) === 'done',
  );
  return doneToday ? toIsoDate(day(today) + 1) : today;
}

/**
 * Progression state at `fromDate`, read from the plan before it. After a pause only what came
 * before the pause counts (`trainedUntil` = pause start) and the athlete is rested.
 */
function continuationState(plan: Plan, fromDate: string, trainedUntil = fromDate) {
  const from = day(trainedUntil);
  const before = plan.weeks.filter((w) => day(w.startDate) + 7 <= from);
  const loading = (w: PlanWeek) => !w.isRecovery && w.phase !== 'taper' && !w.isPartial;
  // Irregular and travel weeks progress levels but are no load reference (as in generatePlan).
  const irregular = (w: PlanWeek) =>
    w.notes.some((n) => n.key === 'notes.weekOverride' || n.key === 'notes.travelWeek');
  const reference = [...before].reverse().find((w) => loading(w) && !irregular(w))?.load ?? null;

  let lastBenchmarkWeek: number | null = null;
  const levels: Record<string, number> = {};
  const longMin: Partial<Record<Sport, number>> = {};
  for (const week of plan.weeks) {
    for (const w of week.workouts) {
      if (day(w.date) >= from) continue;
      if (w.role === 'benchmark') lastBenchmarkWeek = week.index;
      if (w.level !== null && w.role !== 'benchmark') {
        const next = loading(week) ? w.level + 1 : w.level;
        levels[w.templateId] = Math.max(levels[w.templateId] ?? 0, next);
      }
      if (w.role === 'long') {
        longMin[w.sport as Sport] = loading(week)
          ? w.durationMin + planConfig.long.weeklyIncreaseMin
          : w.durationMin;
      }
    }
  }
  const dayBefore = allWorkouts(plan).filter(
    (w) => trainedUntil === fromDate && day(w.date) === day(fromDate) - 1,
  );
  const prev: PrevDay = {
    hard: dayBefore.some((w) => w.hard),
    heavyLegs: dayBefore.some(isHeavyLegs),
    eccentric: dayBefore.some((w) => w.terrain?.eccentric === true),
  };
  return { reference, levels, longMin, prev, lastBenchmarkWeek };
}

interface RegenerateOptions {
  firstWeekFactor?: number;
  restartPhases?: boolean;
  /** Level drop after a pause (days paused). */
  pauseDays?: number;
  /** Start of the pause: planned workouts from here to `fromDate` are dropped. */
  dropFrom?: string;
  /** Last day to rebuild (a Sunday); the weeks after it stay as they are. */
  until?: string;
}

function regenerateFrom(
  state: PlanState,
  input: PlanInput,
  fromDate: string,
  opts: RegenerateOptions = {},
): EditResult<PlanState> {
  const { plan } = state;
  const range = planRange(plan);
  const base = continuationState(plan, fromDate, opts.dropFrom);
  const { pauseDays } = opts;
  const levels =
    pauseDays === undefined
      ? base.levels
      : Object.fromEntries(
          Object.entries(base.levels).map(([id, l]) => [id, levelAfterPause(l, pauseDays)]),
        );

  // Kept: everything before `fromDate` (minus planned sessions inside a pause) and all done ones.
  const { until } = opts;
  const keep = (w: Workout) => {
    const s = statusOf(state, w.id);
    if (s === 'done') return true;
    if (w.date >= fromDate) return until !== undefined && w.date > until;
    return !(opts.dropFrom !== undefined && w.date >= opts.dropFrom && s === 'planned');
  };
  const kept = allWorkouts(plan).filter(keep);

  let weeks = plan.weeks;
  if (fromDate <= range.last) {
    const revision = state.revision + 1;
    let partial: { weeks: number; next: NextDay } | null = null;
    if (until !== undefined) {
      const after = activeWorkouts(state).filter((w) => day(w.date) === day(until) + 1);
      const mondayOf = (iso: string) => day(iso) - weekdayOf(day(iso));
      partial = {
        weeks: (mondayOf(until) - mondayOf(fromDate)) / 7 + 1,
        next: { hard: after.some((w) => w.hard), longOrKey: after.some(isLongOrKey) },
      };
    }
    const generated = generatePlan(
      input.profile,
      input.goal,
      input.availability,
      fromDate,
      input.targetDate,
      {
        planStartDate: plan.startDate,
        referenceLoad: base.reference,
        levels,
        longMin: base.longMin,
        prev: base.prev,
        lastBenchmarkWeek: base.lastBenchmarkWeek,
        idPrefix: `r${revision}-`,
        ...(opts.firstWeekFactor === undefined ? {} : { firstWeekFactor: opts.firstWeekFactor }),
        ...(opts.restartPhases ? { restartPhases: true } : {}),
        ...(partial ?? {}),
      },
    );
    if (!generated.ok) return generated;
    const byIndex = new Map(generated.value.weeks.map((w) => [w.index, w]));
    // A done session keeps its day; new sessions on that day are dropped.
    const doneDays = new Set(
      kept.filter((k) => statusOf(state, k.id) === 'done').map((k) => k.date),
    );
    weeks = plan.weeks.map((w) => {
      const fresh = byIndex.get(w.index);
      return fresh ? { ...fresh, isPartial: w.isPartial } : w;
    });
    const freshWorkouts = generated.value.weeks
      .flatMap((w) => w.workouts)
      .filter((w) => w.date >= fromDate && !doneDays.has(w.date));
    const workouts = [...kept, ...freshWorkouts];
    const ids = new Set(workouts.map((w) => w.id));
    const status = Object.fromEntries(Object.entries(state.status).filter(([id]) => ids.has(id)));
    return {
      ok: true,
      value: {
        ...state,
        status,
        revision,
        plan: rebuild({ ...plan, weeks }, workouts, input.profile.experience),
      },
    };
  }
  return {
    ok: true,
    value: { ...state, plan: rebuild(plan, kept, input.profile.experience) },
  };
}

/**
 * New availability (or other input) from `today` on: completed workouts and everything before
 * stay, the remaining weeks are generated again with the progression reached so far.
 */
export function regeneratePlan(
  state: PlanState,
  input: PlanInput,
  today: string,
): EditResult<PlanState> {
  if (activePause(state)) return fail('pause', 'paused');
  return regenerateFrom(state, input, regenerationStart(state, today));
}

// ---------------------------------------------------------------------------------------------
// Irregular weeks & travel (CLAUDE.md "Real-life & seasonal adaptation")

/** The new plan state plus the input to store with it (it now carries the override / travel). */
export interface AdjustResult {
  state: PlanState;
  input: PlanInput;
}

/**
 * Rebuilds the weeks from `fromDate` to `toDate` (whole weeks, from today at the earliest) with the
 * new input; every other week stays as it is. Spacing towards the kept Monday after is respected.
 */
function rebuildWeeks(
  state: PlanState,
  input: PlanInput,
  fromDate: string,
  toDate: string,
  today: string,
): EditResult<AdjustResult> {
  if (activePause(state)) return fail('pause', 'paused');
  const range = planRange(state.plan);
  const monday = (iso: string) => day(iso) - weekdayOf(day(iso));
  const start = [toIsoDate(monday(fromDate)), regenerationStart(state, today), range.first].reduce(
    (a, b) => (a > b ? a : b),
  );
  const end = [toIsoDate(monday(toDate) + 6), range.last].reduce((a, b) => (a < b ? a : b));
  if (start > end) return { ok: true, value: { state, input } };
  const result = regenerateFrom(state, input, start, end < range.last ? { until: end } : {});
  return result.ok ? { ok: true, value: { state: result.value, input } } : result;
}

/**
 * "This week is different": other minutes per day and/or days away for the week starting on
 * `weekStart` (a Monday). That week is rebuilt keeping its load as far as possible and every
 * spacing rule; `null` removes the override and rebuilds the normal week ("reset week").
 */
export function setWeekOverride(
  state: PlanState,
  input: PlanInput,
  weekStart: string,
  override: Omit<WeekOverride, 'weekStart'> | null,
  today: string,
): EditResult<AdjustResult> {
  const monday = parseIsoDate(weekStart);
  if (monday === null || weekdayOf(monday) !== 0) return fail('date', 'invalidDate');
  const range = planRange(state.plan);
  if (toIsoDate(monday + 6) < range.first || weekStart > range.last)
    return fail('date', 'outsidePlan');
  if (toIsoDate(monday + 6) < today) return fail('date', 'invalidDate');
  const others = (input.availability.weekOverrides ?? []).filter((o) => o.weekStart !== weekStart);
  const weekOverrides = override === null ? others : [...others, { ...override, weekStart }];
  const availability = { ...input.availability, weekOverrides };
  return rebuildWeeks(state, { ...input, availability }, weekStart, weekStart, today);
}

/** The week override for the week starting on `weekStart`, if any. */
export function weekOverrideOf(input: PlanInput, weekStart: string): WeekOverride | null {
  return input.availability.weekOverrides?.find((o) => o.weekStart === weekStart) ?? null;
}

/**
 * Sets the travel periods (travel mode). Every week touched by an old or new period is rebuilt –
 * strength with hotel equipment, time-based runs, bike/swim alternatives; the rest stays.
 */
export function setTravel(
  state: PlanState,
  input: PlanInput,
  travel: readonly TravelPeriod[],
  today: string,
): EditResult<AdjustResult> {
  if (
    travel.some(
      (t) =>
        parseIsoDate(t.startDate) === null ||
        parseIsoDate(t.endDate) === null ||
        t.endDate < t.startDate,
    )
  ) {
    return fail('date', 'invalidDate');
  }
  const before = input.availability.travel ?? [];
  const key = (t: TravelPeriod) => JSON.stringify(t);
  const changed = [
    ...before.filter((t) => !travel.some((n) => key(n) === key(t))),
    ...travel.filter((t) => !before.some((o) => key(o) === key(t))),
  ];
  const next: PlanInput = { ...input, availability: { ...input.availability, travel } };
  if (changed.length === 0) return { ok: true, value: { state, input: next } };
  const from = changed.map((t) => t.startDate).reduce((a, b) => (a < b ? a : b));
  const to = changed.map((t) => t.endDate).reduce((a, b) => (a > b ? a : b));
  return rebuildWeeks(state, next, from, to, today);
}

/** Travel periods that are not over yet (for the travel mode toggle). */
export function activeTravel(input: PlanInput, today: string): TravelPeriod | null {
  return (
    (input.availability.travel ?? [])
      .filter((t) => t.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  );
}

// ---------------------------------------------------------------------------------------------
// Pause / resume

/** Starts a pause (illness, injury, holiday) from `startDate` (today or later, inside the plan). */
export function pausePlan(
  state: PlanState,
  reason: PauseReason,
  startDate: string,
  today: string,
): EditResult<PlanState> {
  if (activePause(state)) return fail('pause', 'paused');
  if (parseIsoDate(startDate) === null || startDate < today) return fail('date', 'invalidDate');
  const range = planRange(state.plan);
  if (startDate > range.last) return fail('date', 'outsidePlan');
  return {
    ok: true,
    value: { ...state, pauses: [...state.pauses, { reason, startDate, endDate: null }] },
  };
}

/** First-week load after a pause: ≤ 7 days 80 %, ≤ 14 days 70 %, longer 60 % and back to Base. */
export function resumeRules(pauseDays: number): { factor: number; restartPhases: boolean } {
  const rule = cfg.resume.find((r) => pauseDays <= r.maxDays);
  return rule
    ? { factor: rule.factor, restartPhases: false }
    : { factor: cfg.longPauseFactor, restartPhases: true };
}

/**
 * Ends the running pause on `resumeDate` (the first training day again, today or later): planned
 * sessions inside the pause are removed and the rest of the plan is generated again with the
 * resume reduction and lower levels.
 */
export function resumePlan(
  state: PlanState,
  resumeDate: string,
  input: PlanInput,
  today: string,
): EditResult<PlanState> {
  const pause = activePause(state);
  if (!pause) return fail('pause', 'notPaused');
  if (parseIsoDate(resumeDate) === null || resumeDate < today || resumeDate < pause.startDate) {
    return fail('date', 'invalidDate');
  }
  const pauseDays = day(resumeDate) - day(pause.startDate);
  const ended: PlanState = {
    ...state,
    pauses: state.pauses.map((p) => (p === pause ? { ...p, endDate: resumeDate } : p)),
  };
  if (pauseDays === 0)
    return { ok: true, value: { ...state, pauses: state.pauses.filter((p) => p !== pause) } };
  const rules = resumeRules(pauseDays);
  return regenerateFrom(ended, input, resumeDate, {
    firstWeekFactor: rules.factor,
    restartPhases: rules.restartPhases,
    pauseDays,
    dropFrom: pause.startDate,
  });
}
