import type { HrZone } from '../hr';
import { activityLoad, isEccentricActivity, isHardActivity, type Activity } from './activities';
import { planConfig } from './config';
import { parseIsoDate, toIsoDate } from './dates';
import {
  allWorkouts,
  easeWorkout,
  isPaused,
  rebuild,
  setWorkoutStatus,
  statusOf,
  type PlanInput,
  type PlanState,
} from './edit';
import { getTemplate } from './library';
import { round1 } from './load';
import { athleteFor, materialize } from './materialize';
import type { PlanNote, Workout } from './types';
import { describeWorkout } from './workout-type';

/**
 * An unplanned activity (CLAUDE.md "After import"): it counts towards the week's load and the rest
 * of the week is rebalanced – easy sessions later in that week get shorter by about the extra
 * load, and a hard activity makes a hard session on the next day easy (no hard days back to back).
 * Long, key and quality sessions, strength and commutes keep their length.
 */

const cfg = planConfig.activities;

export interface AbsorbChange {
  workoutId: string;
  fromMin: number;
  toMin: number;
}

export interface AbsorbResult {
  state: PlanState;
  /** Load of the activity in the unified load model. */
  load: number;
  hard: boolean;
  /** A long running descent: heavy leg strength on the next day was made light. */
  eccentric: boolean;
  /** Easy sessions made shorter. */
  shortened: AbsorbChange[];
  /** Hard sessions on the next day made easy. */
  eased: string[];
}

const day = (iso: string): number => parseIsoDate(iso) as number;

function shorten(w: Workout, toMin: number, input: PlanInput, note: PlanNote): Workout | null {
  const template = getTemplate(w.templateId);
  const m = materialize(
    template,
    w.level,
    toMin,
    w.role,
    athleteFor(input.profile, input.goal.kind),
    cfg.minEasyMin,
  );
  /* v8 ignore next -- easy templates always scale down to the minimum */
  if (m.durationMin >= w.durationMin) return null;
  return describeWorkout({
    ...w,
    durationMin: m.durationMin,
    load: m.load,
    target: m.target,
    warmup: m.warmup,
    main: m.main,
    cooldown: m.cooldown,
    terrain: m.terrain,
    notes: [...w.notes, note],
  });
}

/**
 * Rebalances the plan for one unplanned activity. Only sessions from `today` on change; nothing
 * changes during a pause or outside the plan. The activity's week gets a note with its load.
 */
export function absorbActivity(
  state: PlanState,
  input: PlanInput,
  activity: Activity,
  hrZones: readonly HrZone[],
  today: string,
): AbsorbResult {
  return absorbImpact(
    state,
    input,
    {
      date: activity.date,
      sport: activity.sport,
      minutes: Math.round(activity.durationSec / 60),
      load: activityLoad(activity, hrZones),
      hard: isHardActivity(activity, hrZones),
      eccentric: isEccentricActivity(activity),
    },
    today,
    { countLoad: true },
  );
}

/** What a finished session did, in the unified load model. */
export interface SessionImpact {
  date: string;
  sport: string;
  minutes: number;
  load: number;
  /** Counts as hard for "no hard days back to back" (heavy legs for strength). */
  hard: boolean;
  eccentric: boolean;
}

/**
 * The common rebalance: a hard session makes a hard session on the next day easy, an eccentric one
 * eases heavy legs on the next day, and – with `countLoad` (unplanned sessions) – the load comes off
 * the easy sessions later in that week and the week gets a note.
 */
export function absorbImpact(
  state: PlanState,
  input: PlanInput,
  impact: SessionImpact,
  today: string,
  options: { countLoad: boolean },
): AbsorbResult {
  const { load, hard, eccentric } = impact;
  const unchanged: AbsorbResult = { state, load, hard, eccentric, shortened: [], eased: [] };
  const activity = { date: impact.date };
  const date = day(activity.date);
  const week = state.plan.weeks.find(
    (w) => day(w.startDate) <= date && date < day(w.startDate) + 7,
  );
  if (!week || isPaused(state, activity.date)) return unchanged;

  const noteParams = { sport: impact.sport, minutes: impact.minutes, load: round1(load) };
  let next: PlanState = state;

  // 1. A hard activity: a hard session on the next day becomes easy.
  const eased: string[] = [];
  if (hard) {
    const tomorrow = toIsoDate(date + 1);
    const hardTomorrow = allWorkouts(next.plan).filter(
      (w) => w.date === tomorrow && w.date >= today && w.hard && statusOf(next, w.id) === 'planned',
    );
    for (const w of hardTomorrow) {
      const result = easeWorkout(next, w.id, input);
      /* v8 ignore next -- the workout was just found in the plan */
      if (!result.ok) continue;
      next = result.value;
      eased.push(w.id);
    }
  }

  // 1b. A long running descent: no heavy legs the next day (CLAUDE.md "Terrain" §6).
  if (eccentric) {
    const tomorrow = toIsoDate(date + 1);
    const heavyTomorrow = allWorkouts(next.plan).filter(
      (w) =>
        w.date === tomorrow &&
        w.date >= today &&
        w.sport === 'strength' &&
        w.legLoad === 'heavy' &&
        !eased.includes(w.id) &&
        statusOf(next, w.id) === 'planned',
    );
    for (const w of heavyTomorrow) {
      const result = easeWorkout(next, w.id, input);
      /* v8 ignore next -- the workout was just found in the plan */
      if (!result.ok) continue;
      next = result.value;
      eased.push(w.id);
    }
  }

  // A planned session that was done: its load was planned, only the spacing reacts.
  if (!options.countLoad) {
    return { state: next, load, hard, eccentric, shortened: [], eased };
  }

  // 2. The extra load comes off the easy sessions left in that week, the latest first.
  let remaining = load * cfg.absorbShare;
  const shortened: AbsorbChange[] = [];
  const replaced = new Map<string, Workout>();
  const note: PlanNote = { key: 'notes.absorbed', params: noteParams };
  const candidates = allWorkouts(next.plan)
    .filter(
      (w) =>
        w.date > activity.date &&
        w.date >= today &&
        day(w.date) < day(week.startDate) + 7 &&
        w.role === 'easy' &&
        !eased.includes(w.id) &&
        statusOf(next, w.id) === 'planned' &&
        getTemplate(w.templateId).durationScaled !== undefined &&
        w.durationMin > cfg.minEasyMin,
    )
    // Stable sort: sessions on the same day keep the plan's order.
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const w of candidates) {
    if (remaining <= 0) break;
    const perMin = w.load / w.durationMin;
    const cutMin = Math.ceil(remaining / perMin / 5) * 5;
    const toMin = Math.max(cfg.minEasyMin, w.durationMin - cutMin);
    const short = shorten(w, toMin, input, note);
    /* v8 ignore next */
    if (!short) continue;
    replaced.set(w.id, short);
    shortened.push({ workoutId: w.id, fromMin: w.durationMin, toMin: short.durationMin });
    remaining -= w.load - short.load;
  }

  const workouts = allWorkouts(next.plan).map((w) => replaced.get(w.id) ?? w);
  const plan = rebuild(next.plan, workouts, input.profile);
  const weeks = plan.weeks.map((w) =>
    w.index === week.index
      ? { ...w, notes: [...w.notes, { key: 'notes.unplannedActivity', params: noteParams }] }
      : w,
  );
  return {
    state: { ...next, plan: { ...plan, weeks } },
    load,
    hard,
    eccentric,
    shortened,
    eased,
  };
}

/**
 * A finished gym session in the plan (CLAUDE.md "Gym": completed gym sessions feed the unified
 * load model). `impact` comes from `gymSessionImpact` (Phase 3 rules: the heaviest exercise sets the
 * leg load, heavy legs count as hard). A session that fulfils a planned workout marks it done; if
 * it was heavier on the legs than planned, a hard session on the next day becomes easy. An
 * unplanned session is absorbed like any unplanned activity.
 */
export function absorbGymSession(
  state: PlanState,
  input: PlanInput,
  session: { date: string; plannedWorkoutId?: string },
  impact: Omit<SessionImpact, 'date' | 'sport' | 'eccentric'>,
  today: string,
): AbsorbResult & { matched: boolean } {
  const planned = session.plannedWorkoutId
    ? allWorkouts(state.plan).find((w) => w.id === session.plannedWorkoutId)
    : undefined;
  const full: SessionImpact = {
    ...impact,
    date: session.date,
    sport: 'strength',
    eccentric: false,
  };
  if (!planned) {
    return { ...absorbImpact(state, input, full, today, { countLoad: true }), matched: false };
  }
  const done = setWorkoutStatus(state, planned.id, 'done');
  /* v8 ignore next -- the workout was just found in the plan */
  const next = done.ok ? done.value : state;
  // Only what is harder than planned changes the spacing; the planned hard day was already spaced.
  const harder = { ...full, hard: full.hard && !planned.hard };
  return { ...absorbImpact(next, input, harder, today, { countLoad: false }), matched: true };
}
