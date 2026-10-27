import { goalFamily } from './composition';
import { planConfig } from './config';
import { parseIsoDate, toIsoDate } from './dates';
import { isPaused, planRange, statusOf, type PlanState } from './edit';
import { workoutKm } from './summary';
import type { GoalKind, Sport, UserProfile, Workout } from './types';

/**
 * What became of a plan when it was archived (CLAUDE.md "Plan history"):
 * - `completed` – ran through all its weeks with at least `completion.minShare` of the sessions done;
 * - `finished` – ran through all its weeks, fewer sessions done;
 * - `replaced` – a new plan was started before its end. Never completed, whatever was done.
 */
export type PlanOutcome = 'completed' | 'finished' | 'replaced';

/** Session groups of the summary (and of the review). */
export type SummaryGroup = 'long' | 'quality' | 'easy' | 'strength';

export interface GroupCount {
  planned: number;
  done: number;
}

/** The figures an archived plan keeps (Profile → Plan history, badges, the review). */
export interface PlanSummary {
  goal: GoalKind;
  startDate: string;
  /** Last plan day (the day before the race for race goals). */
  endDate: string;
  /** Last day the summary covers: the end, or the day before archiving when replaced early. */
  coveredUntil: string;
  /** Sports with at least one planned session (bricks count as bike and run). */
  sports: Sport[];
  sessionsPlanned: number;
  sessionsDone: number;
  sessionsSkipped: number;
  /** Done / planned, 0–1 (two decimals); 0 for a plan without sessions so far. */
  completion: number;
  minutesDone: number;
  kmDone: number;
  byGroup: Record<SummaryGroup, GroupCount>;
}

export function summaryGroup(w: Workout): SummaryGroup {
  if (w.sport === 'strength') return 'strength';
  if (w.role === 'long') return 'long';
  if (['key', 'quality', 'brick', 'benchmark'].includes(w.role)) return 'quality';
  return 'easy';
}

const SPORT_OF: Partial<Record<Workout['sport'], Sport[]>> = {
  run: ['run'],
  bike: ['bike'],
  swim: ['swim'],
  brick: ['bike', 'run'],
};

/**
 * Sessions of the plan up to `today` (the day before archiving) or its end, whichever is first:
 * commutes are left out (no session of their own), sessions inside a pause too.
 */
export function planSummary(state: PlanState, profile: UserProfile, today: string): PlanSummary {
  const { plan } = state;
  const range = planRange(plan);
  const until = today > range.last ? range.last : today;
  const byGroup: Record<SummaryGroup, GroupCount> = {
    long: { planned: 0, done: 0 },
    quality: { planned: 0, done: 0 },
    easy: { planned: 0, done: 0 },
    strength: { planned: 0, done: 0 },
  };
  const sports = new Set<Sport>();
  let planned = 0;
  let done = 0;
  let skipped = 0;
  let minutes = 0;
  let km = 0;
  for (const w of plan.weeks.flatMap((x) => x.workouts)) {
    if (w.role === 'commute' || isPaused(state, w.date)) continue;
    for (const s of SPORT_OF[w.sport] ?? []) sports.add(s);
    if (w.date > until) continue;
    const status = statusOf(state, w.id);
    const group = byGroup[summaryGroup(w)];
    planned++;
    group.planned++;
    if (status === 'skipped') skipped++;
    if (status !== 'done') continue;
    done++;
    group.done++;
    minutes += w.durationMin;
    km += workoutKm(w, profile);
  }
  return {
    goal: plan.goal.kind,
    startDate: plan.startDate,
    endDate: range.last,
    coveredUntil: until,
    sports: [...sports].sort(),
    sessionsPlanned: planned,
    sessionsDone: done,
    sessionsSkipped: skipped,
    completion: planned === 0 ? 0 : Math.round((done / planned) * 100) / 100,
    minutesDone: minutes,
    kmDone: Math.round(km * 10) / 10,
    byGroup,
  };
}

/** True once every plan day lies before `today`. */
export function planEnded(state: PlanState, today: string): boolean {
  return today > planRange(state.plan).last;
}

/**
 * Outcome of archiving the plan on `today`. Before its end it is `replaced`; after it, the share
 * of done sessions decides between `completed` and `finished`.
 */
export function planOutcome(
  state: PlanState,
  profile: UserProfile,
  today: string,
): { outcome: PlanOutcome; summary: PlanSummary } {
  // The archive day itself is the first day of the new plan – it does not count as missed.
  const summary = planSummary(state, profile, toIsoDate((parseIsoDate(today) as number) - 1));
  if (!planEnded(state, today)) return { outcome: 'replaced', summary };
  const completed = summary.completion >= planConfig.completion.minShare;
  return { outcome: completed ? 'completed' : 'finished', summary };
}

// ---------------------------------------------------------------------------------------------
// Badges: derived from archived plans, never stored on their own (they sync with the plans).

/**
 * `plan` – one per completed plan; milestones once each: `firstPlan` (first completed plan),
 * `firstMultisport` (first completed triathlon / duathlon plan), `allIn` (first plan with at least
 * `completion.badgeShare` of its sessions done). No streaks, nothing about weight or food.
 */
export type BadgeKind = 'plan' | 'firstPlan' | 'firstMultisport' | 'allIn';

export interface Badge {
  kind: BadgeKind;
  /** The plan that earned it. */
  planId: string;
  goal: GoalKind;
  /** `YYYY-MM` of the plan's last day ("Half marathon plan · Mar 2027"). */
  month: string;
  completion: number;
}

/** Badges of the archived plans, newest first (milestones before the plan badge they came with). */
export function planBadges(
  archived: readonly { id: string; outcome: PlanOutcome; summary: PlanSummary }[],
): Badge[] {
  const completed = archived
    .filter((a) => a.outcome === 'completed')
    .sort((a, b) => a.summary.endDate.localeCompare(b.summary.endDate));
  const badges: Badge[] = [];
  const earned = new Set<BadgeKind>();
  for (const a of completed) {
    const badge = (kind: BadgeKind): Badge => ({
      kind,
      planId: a.id,
      goal: a.summary.goal,
      month: a.summary.endDate.slice(0, 7),
      completion: a.summary.completion,
    });
    badges.push(badge('plan'));
    const milestones: [BadgeKind, boolean][] = [
      ['firstPlan', true],
      ['firstMultisport', goalFamily(a.summary.goal) === 'multisport'],
      ['allIn', a.summary.completion >= planConfig.completion.badgeShare],
    ];
    for (const [kind, ok] of milestones) {
      if (!ok || earned.has(kind)) continue;
      earned.add(kind);
      badges.push(badge(kind));
    }
  }
  return badges.reverse();
}
