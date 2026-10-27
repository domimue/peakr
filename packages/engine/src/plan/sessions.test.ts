import { describe, expect, it } from 'vitest';

import { suggestedSessions } from './composition';
import { generatePlan } from './generate';
import type { Availability, Plan, Sport, UserProfile } from './types';

const athlete = (over: Partial<UserProfile> = {}): UserProfile => ({
  age: 35,
  experience: 'intermediate',
  sports: ['run'],
  terrain: 'flat',
  strength: { mode: 'none' },
  ...over,
});
const roomy: Availability = {
  minutesPerDay: [60, 60, 60, 60, 60, 120, 90],
  doublesAllowed: false,
};
/** Sessions of a sport in a full loading week (week 2: the first may be partial). */
const countIn = (plan: Plan, sport: Sport, week = 1) =>
  (plan.weeks[week]?.workouts ?? []).filter((w) => w.sport === sport).length;

function plan(profile: UserProfile, goal: Parameters<typeof generatePlan>[1], target?: string) {
  const r = generatePlan(profile, goal, roomy, '2026-10-26', target);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

describe('sessions per discipline', () => {
  it('Peakr suggests what fits the goal and level when the user leaves it open', () => {
    expect(suggestedSessions('fitness', athlete({ experience: 'beginner' }))).toEqual({
      run: 3,
      bike: 0,
      swim: 0,
    });
    expect(suggestedSessions('half', athlete({ experience: 'advanced' })).run).toBe(5);
    const tri = suggestedSessions('tri_olympic', athlete({ sports: ['run', 'bike', 'swim'] }));
    expect(tri.run).toBeGreaterThan(0);
    expect(tri.bike).toBeGreaterThan(0);
    expect(tri.swim).toBeGreaterThan(0);
    const duathlon = suggestedSessions(
      'duathlon',
      athlete({ sports: ['run', 'bike'], experience: 'advanced' }),
    );
    expect(duathlon.run + duathlon.bike).toBeGreaterThan(2);
  });

  it('plans the number the user asked for – fewer and more than suggested', () => {
    const suggested = suggestedSessions('half', athlete());
    const fewer = plan(athlete({ sessionsPerWeek: { run: 3 } }), { kind: 'half' }, '2027-04-01');
    expect(countIn(fewer, 'run')).toBe(3);
    expect(suggested.run).toBeGreaterThan(3);
    // The long run stays when sessions are dropped.
    expect(fewer.weeks[1]?.workouts.some((w) => w.role === 'long')).toBe(true);
    const more = plan(athlete({ sessionsPerWeek: { run: 6 } }), { kind: 'half' }, '2027-04-01');
    expect(countIn(more, 'run')).toBe(6);
  });

  it('per discipline in a multisport plan; a sport left open keeps the suggestion', () => {
    const profile = athlete({ sports: ['run', 'bike'], sessionsPerWeek: { bike: 3 } });
    const p = plan(profile, { kind: 'fitness' });
    expect(countIn(p, 'bike')).toBe(3);
    expect(countIn(p, 'run')).toBeGreaterThan(0);
    const swim = plan(athlete({ sports: ['swim'], sessionsPerWeek: { swim: 5 } }), {
      kind: 'fitness',
    });
    expect(countIn(swim, 'swim')).toBe(5);
  });

  it('own sessions get a useful length from the start – more sessions, not shorter ones', () => {
    const days: Availability = {
      minutesPerDay: [60, 60, 60, 60, 60, 120, 90],
      doublesAllowed: false,
    };
    const easyRuns = (p: Plan, week: number) =>
      (p.weeks[week]?.workouts ?? []).filter((w) => w.sport === 'run' && w.role === 'easy');
    const build = (profile: UserProfile, start = '2026-10-26') => {
      const r = generatePlan(profile, { kind: 'fitness' }, days, start);
      if (!r.ok) throw new Error(JSON.stringify(r.issues));
      return r.value;
    };
    const own = athlete({ sports: ['run', 'bike'], sessionsPerWeek: { run: 4, bike: 2 } });
    const p = build(own);
    expect(easyRuns(p, 0)).toHaveLength(3);
    for (const w of easyRuns(p, 0)) expect(w.durationMin).toBeGreaterThanOrEqual(35);
    // The +10 % rule carries it on from there.
    for (const w of easyRuns(p, 1)) expect(w.durationMin).toBeGreaterThanOrEqual(35);
    // Started on a Thursday: the first full week is checked as well.
    for (const w of easyRuns(build(own, '2026-10-29'), 1)) {
      expect(w.durationMin).toBeGreaterThanOrEqual(35);
    }
    // Left to Peakr: nothing raised.
    const suggested = build(athlete({ sports: ['run', 'bike'] }));
    expect(suggested.weeks[0]?.load ?? 0).toBeLessThan(p.weeks[0]?.load ?? 0);
  });

  it('a day too short for the useful length keeps its short session; the plan is still built', () => {
    const r = generatePlan(
      athlete({ sessionsPerWeek: { run: 5 } }),
      { kind: 'fitness' },
      { minutesPerDay: [30, 30, 30, 30, 0, 90, 0], doublesAllowed: false },
      '2026-10-26',
    );
    expect(r.ok).toBe(true);
  });
});
