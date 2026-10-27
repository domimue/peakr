import { describe, expect, it } from 'vitest';

import type { PlanState } from './edit';
import { generatePlan } from './generate';
import {
  planBadges,
  planEnded,
  planOutcome,
  planSummary,
  summaryGroup,
  type PlanSummary,
} from './outcome';
import type { Availability, UserProfile, Workout } from './types';

const profile: UserProfile = {
  age: 35,
  experience: 'intermediate',
  sports: ['run'],
  terrain: 'rolling',
  strength: { mode: 'peakr' },
  commutes: [{ id: 'c1', sport: 'bike', oneWayMin: 20, weekdays: [1], bothWays: false }],
};
const availability: Availability = {
  minutesPerDay: [60, 60, 45, 60, 0, 120, 90],
  doublesAllowed: false,
};

function state(): PlanState {
  const r = generatePlan(profile, { kind: '10k' }, availability, '2026-11-02', '2027-01-31');
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return { plan: r.value, status: {}, pauses: [], revision: 0 };
}
const sessions = (s: PlanState) =>
  s.plan.weeks.flatMap((w) => w.workouts).filter((w) => w.role !== 'commute');
/** Marks the first `share` of the sessions done, the rest skipped. */
function withDone(s: PlanState, share: number): PlanState {
  const all = sessions(s);
  const n = Math.round(all.length * share);
  return {
    ...s,
    status: Object.fromEntries(all.map((w, i) => [w.id, i < n ? 'done' : 'skipped'])),
  };
}

describe('plan outcome (CLAUDE.md "Plan history")', () => {
  it('a plan run through with ≥ 80 % of its sessions done is completed', () => {
    const s = withDone(state(), 0.8);
    const r = planOutcome(s, profile, '2027-02-01');
    expect(r.outcome).toBe('completed');
    expect(r.summary.completion).toBeGreaterThanOrEqual(0.8);
    expect(r.summary.sessionsPlanned).toBe(sessions(s).length);
    expect(r.summary.endDate).toBe('2027-01-30');
    expect(r.summary.sports).toEqual(['run']);
    expect(r.summary.byGroup.long.planned).toBeGreaterThan(0);
    expect(r.summary.byGroup.strength.planned).toBeGreaterThan(0);
    expect(r.summary.minutesDone).toBeGreaterThan(0);
    expect(r.summary.kmDone).toBeGreaterThan(0);
  });

  it('below 80 % it is finished, not completed', () => {
    const r = planOutcome(withDone(state(), 0.7), profile, '2027-02-01');
    expect(r.outcome).toBe('finished');
    expect(r.summary.sessionsSkipped).toBeGreaterThan(0);
  });

  it('a plan switched before its end is only archived – never completed', () => {
    const s = withDone(state(), 1);
    const r = planOutcome(s, profile, '2026-12-01');
    expect(r.outcome).toBe('replaced');
    // Only the sessions up to the day before count; all of them were done.
    expect(r.summary.coveredUntil).toBe('2026-11-30');
    expect(r.summary.completion).toBe(1);
    expect(r.summary.sessionsPlanned).toBeLessThan(sessions(s).length);
    // On race day the plan has ended (race goals end the day before the race).
    expect(planEnded(s, '2027-01-31')).toBe(true);
    expect(planEnded(s, '2027-01-30')).toBe(false);
  });

  it('commutes and paused days are no planned sessions', () => {
    const s = state();
    const summary = planSummary(s, profile, '2027-02-01');
    expect(summary.sessionsPlanned).toBe(sessions(s).length);
    const paused = {
      ...s,
      pauses: [{ reason: 'illness' as const, startDate: '2026-12-01', endDate: '2026-12-15' }],
    };
    const inPause = sessions(s).filter((w) => w.date >= '2026-12-01' && w.date < '2026-12-15');
    expect(inPause.length).toBeGreaterThan(0);
    expect(planSummary(paused, profile, '2027-02-01').sessionsPlanned).toBe(
      summary.sessionsPlanned - inPause.length,
    );
    // Nothing planned yet: completion 0, no division by zero.
    expect(planSummary(s, profile, '2026-11-01').completion).toBe(0);
  });

  it('groups sessions into long, quality, easy and strength; bricks count as bike and run', () => {
    const w = (sport: Workout['sport'], role: Workout['role']) => ({ sport, role }) as Workout;
    expect(summaryGroup(w('run', 'long'))).toBe('long');
    expect(summaryGroup(w('run', 'benchmark'))).toBe('quality');
    expect(summaryGroup(w('strength', 'strength'))).toBe('strength');
    expect(summaryGroup(w('swim', 'technique'))).toBe('easy');
    const s = state();
    const week = s.plan.weeks[0] as PlanState['plan']['weeks'][number];
    const brick = { ...(week.workouts[0] as Workout), sport: 'brick' as const, id: 'b' };
    const winter = { ...(week.workouts[0] as Workout), sport: 'xcski' as const, id: 'x' };
    const one = { ...s, plan: { ...s.plan, weeks: [{ ...week, workouts: [brick, winter] }] } };
    expect(planSummary(one, profile, '2027-02-01').sports).toEqual(['bike', 'run']);
  });
});

describe('badges for completed plans', () => {
  const plan = (
    id: string,
    outcome: 'completed' | 'finished' | 'replaced',
    goal: PlanSummary['goal'],
    endDate: string,
    completion: number,
  ) => ({ id, outcome, summary: { goal, endDate, completion } as PlanSummary });

  it('only completed plans earn badges; milestones come once, with the plan that earned them', () => {
    const badges = planBadges([
      plan('a', 'completed', '10k', '2026-06-30', 0.85),
      plan('b', 'replaced', 'tri_olympic', '2026-08-31', 1),
      plan('c', 'finished', 'half', '2026-09-30', 0.6),
      plan('d', 'completed', 'tri_sprint', '2026-12-31', 0.97),
      plan('e', 'completed', 'duathlon', '2027-03-31', 0.99),
    ]);
    expect(badges.map((b) => `${b.planId}:${b.kind}`)).toEqual([
      'e:plan',
      'd:allIn',
      'd:firstMultisport',
      'd:plan',
      'a:firstPlan',
      'a:plan',
    ]);
    expect(badges.at(-1)).toEqual({
      kind: 'plan',
      planId: 'a',
      goal: '10k',
      month: '2026-06',
      completion: 0.85,
    });
    expect(planBadges([])).toEqual([]);
  });
});
