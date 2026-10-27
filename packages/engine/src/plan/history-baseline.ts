import { median } from '../stats';
import { planConfig } from './config';
import { parseIsoDate, toIsoDate, weekdayOf } from './dates';
import { workoutDistances } from './distance';
import { statusOf, type PlanState } from './edit';
import { sportMinutes } from './floors';
import { SPORTS, type PlanBaseline, type Sport, type UserProfile, type Workout } from './types';

/**
 * Start values of a new plan from the sessions of the previous one (CLAUDE.md "Plan history"):
 * they are the user's real training, so they come first; the Strava baseline only fills in what
 * they do not say (paces, heart rate). Same shape as the Strava baseline – the floors and week 1
 * use it the same way.
 *
 * - typical long session per sport: median of the done long sessions of the last six weeks;
 * - weekly minutes per sport and start load: mean of the last four full weeks before `today`
 *   (weeks with nothing done count as 0 – that is what the user really did);
 * - level per workout template: the level of its last done session.
 */
const cfg = planConfig.history;

export function historyBaseline(
  state: PlanState,
  profile: UserProfile,
  today: string,
): PlanBaseline {
  const day = parseIsoDate(today) as number;
  const thisMonday = day - weekdayOf(day);
  const volumeFrom = toIsoDate(thisMonday - cfg.volumeWeeks * 7);
  const longFrom = toIsoDate(day - cfg.longWeeks * 7);
  const before = toIsoDate(thisMonday);
  const done = state.plan.weeks
    .flatMap((w) => w.workouts)
    .filter((w) => statusOf(state, w.id) === 'done' && w.date < today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (done.length === 0) return {};

  // Full weeks the plan covered inside the window (a plan younger than four weeks counts fewer).
  const planMonday = parseIsoDate(state.plan.startDate) as number;
  const firstWeek = Math.max(thisMonday - cfg.volumeWeeks * 7, planMonday - weekdayOf(planMonday));
  const weeks = Math.max(1, Math.round((thisMonday - firstWeek) / 7));

  const baseline: PlanBaseline = {};
  const weeklyMin: Partial<Record<Sport, number>> = {};
  const longMin: Partial<Record<Sport, number>> = {};
  const longKm: Partial<Record<Sport, number>> = {};
  const recent = done.filter((w) => w.date >= volumeFrom && w.date < before);
  const load = recent.reduce((sum, w) => sum + w.load, 0);
  for (const sport of SPORTS) {
    const minutes = sportMinutes(recent, sport);
    if (minutes > 0) weeklyMin[sport] = minutes / weeks;
    const longs = done
      .filter((w) => w.role === 'long' && w.sport === sport && w.date >= longFrom)
      .sort((x, y) => x.durationMin - y.durationMin);
    const typical = median(longs.map((w) => w.durationMin));
    if (typical === null) continue;
    longMin[sport] = Math.round(typical);
    // The distance of the middle one of those sessions.
    const middle = longs[Math.floor(longs.length / 2)] as Workout;
    longKm[sport] = Math.round((workoutDistances(middle, profile)[sport] as number) * 10) / 10;
  }
  const rounded = Object.fromEntries(
    Object.entries(weeklyMin).map(([s, m]) => [s, Math.round(m)]),
  ) as Partial<Record<Sport, number>>;
  if (Object.keys(rounded).length > 0) baseline.weeklyMin = rounded;
  if (load > 0) baseline.startLoad = Math.round(load / weeks);
  if (Object.keys(longMin).length > 0) {
    baseline.longMin = longMin;
    baseline.longKm = longKm;
  }
  const levels: Record<string, number> = {};
  for (const w of done) if (w.level !== null) levels[w.templateId] = w.level;
  if (Object.keys(levels).length > 0) baseline.levels = levels;
  return baseline;
}

/**
 * The profile with the previous plan's values merged in: per sport the higher of the two for
 * the long session, the weekly minutes and the start load (the same training is often in both),
 * the levels from the plan, everything else (paces, heart rate, classes) from Strava.
 */
export function withHistoryBaseline(profile: UserProfile, history: PlanBaseline): UserProfile {
  const strava = profile.baseline ?? {};
  const higher = (
    a: Partial<Record<Sport, number>> | undefined,
    b: Partial<Record<Sport, number>> | undefined,
  ) => {
    if (!a && !b) return undefined;
    const out: Partial<Record<Sport, number>> = { ...a };
    for (const [s, v] of Object.entries(b ?? {}) as [Sport, number][])
      out[s] = Math.max(out[s] ?? 0, v);
    return out;
  };
  const longMin = higher(strava.longMin, history.longMin);
  // The distance belongs to whichever long session won.
  const longKm: Partial<Record<Sport, number>> = { ...strava.longKm };
  for (const [s, km] of Object.entries(history.longKm ?? {}) as [Sport, number][]) {
    if ((history.longMin?.[s] ?? 0) >= (strava.longMin?.[s] ?? 0)) longKm[s] = km;
  }
  const weeklyMin = higher(strava.weeklyMin, history.weeklyMin);
  const startLoad =
    strava.startLoad === undefined && history.startLoad === undefined
      ? undefined
      : Math.max(strava.startLoad ?? 0, history.startLoad ?? 0);
  const merged: PlanBaseline = {
    ...strava,
    ...(longMin ? { longMin, longKm } : {}),
    ...(weeklyMin ? { weeklyMin } : {}),
    ...(startLoad !== undefined ? { startLoad } : {}),
    ...(history.levels ? { levels: history.levels } : {}),
  };
  return { ...profile, baseline: merged };
}
