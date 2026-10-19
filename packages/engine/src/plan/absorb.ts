import type { HrZone } from '../hr';
import { activityLoad, isHardActivity, type Activity } from './activities';
import { planConfig } from './config';
import { parseIsoDate, toIsoDate } from './dates';
import {
  allWorkouts,
  easeWorkout,
  isPaused,
  rebuild,
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
  const load = activityLoad(activity, hrZones);
  const hard = isHardActivity(activity, hrZones);
  const unchanged: AbsorbResult = { state, load, hard, shortened: [], eased: [] };
  const date = day(activity.date);
  const week = state.plan.weeks.find(
    (w) => day(w.startDate) <= date && date < day(w.startDate) + 7,
  );
  if (!week || isPaused(state, activity.date)) return unchanged;

  const minutes = Math.round(activity.durationSec / 60);
  const noteParams = { sport: activity.sport, minutes, load: round1(load) };
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
  const plan = rebuild(next.plan, workouts, input.profile.experience);
  const weeks = plan.weeks.map((w) =>
    w.index === week.index
      ? { ...w, notes: [...w.notes, { key: 'notes.unplannedActivity', params: noteParams }] }
      : w,
  );
  return { state: { ...next, plan: { ...plan, weeks } }, load, hard, shortened, eased };
}
