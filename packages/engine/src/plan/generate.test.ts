import { describe, expect, it } from 'vitest';

import { generatePlan } from './generate';
import type { Availability, Plan, UserProfile } from './types';

const runner: UserProfile = {
  age: 35,
  experience: 'intermediate',
  sports: ['run'],
  terrain: 'rolling',
  strength: { mode: 'peakr', equipment: 'gym' },
};
const week: Availability = { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false };

function plan(...args: Parameters<typeof generatePlan>): Plan {
  const result = generatePlan(...args);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

describe('generatePlan – validation', () => {
  const issues = (...args: Parameters<typeof generatePlan>) => {
    const r = generatePlan(...args);
    return r.ok ? [] : r.issues.map((i) => `${i.field}:${i.code}`);
  };

  it('checks dates', () => {
    expect(issues(runner, { kind: 'half' }, week, '2026-13-01')).toEqual(['startDate:invalidDate']);
    expect(issues(runner, { kind: 'half' }, week, '2026-10-19', 'soon')).toEqual([
      'targetDate:invalidDate',
    ]);
    expect(issues(runner, { kind: 'half' }, week, '2026-10-19', '2026-10-19')).toEqual([
      'targetDate:targetNotAfterStart',
    ]);
    expect(issues(runner, { kind: 'half' }, week, '2026-10-19', '2027-12-31')).toEqual([
      'targetDate:planTooLong',
    ]);
    expect(issues(runner, { kind: 'half' }, week, 'x', '2027-01-01')).toEqual([
      'startDate:invalidDate',
    ]);
  });

  it('checks the selected disciplines against the goal', () => {
    expect(issues({ ...runner, sports: [] }, { kind: 'fitness' }, week, '2026-10-19')).toEqual([
      'sports:sportsRequired',
    ]);
    expect(
      issues({ ...runner, sports: ['run', 'run'] }, { kind: 'fitness' }, week, '2026-10-19'),
    ).toEqual(['sports:sportsRequired']);
    expect(
      issues({ ...runner, sports: ['ski' as 'run'] }, { kind: 'fitness' }, week, '2026-10-19'),
    ).toEqual(['sports:sportsRequired']);
    expect(
      issues({ ...runner, sports: ['run', 'bike'] }, { kind: 'tri_sprint' }, week, '2026-10-19'),
    ).toEqual(['sports:goalNeedsSports']);
    expect(
      issues({ ...runner, sports: ['bike'] }, { kind: 'marathon' }, week, '2026-10-19'),
    ).toEqual(['sports:goalNeedsSports']);
  });

  it('checks age, weight-loss age and strength setup', () => {
    expect(issues({ ...runner, age: 5 }, { kind: 'fitness' }, week, '2026-10-19')).toEqual([
      'age:outOfRange',
    ]);
    expect(issues({ ...runner, age: 16 }, { kind: 'weightloss' }, week, '2026-10-19')).toEqual([
      'age:underageWeightLoss',
    ]);
    expect(issues({ ...runner, age: 16 }, { kind: 'fitness' }, week, '2026-10-19')).toEqual([]);
    expect(
      issues({ ...runner, strength: { mode: 'split' } }, { kind: 'fitness' }, week, '2026-10-19'),
    ).toEqual(['strength:required']);
    expect(
      issues(
        { ...runner, strength: { mode: 'routines' } },
        { kind: 'fitness' },
        week,
        '2026-10-19',
      ),
    ).toEqual(['strength:required']);
  });

  it('checks the availability', () => {
    const at = (minutesPerDay: number[]) =>
      ({ minutesPerDay, doublesAllowed: false }) as unknown as Availability;
    expect(issues(runner, { kind: 'fitness' }, at([60, 60, 60]), '2026-10-19')).toEqual([
      'availability:outOfRange',
    ]);
    expect(
      issues(runner, { kind: 'fitness' }, at([60, 60, 60, 60, 60, 60, 700]), '2026-10-19'),
    ).toEqual(['availability:outOfRange']);
    expect(
      issues(runner, { kind: 'fitness' }, at([60, 15, 15, 15, 15, 15, 0]), '2026-10-19'),
    ).toEqual(['availability:notEnoughAvailability']);
  });
});

describe('generatePlan – plan shape', () => {
  it('runs 12 weeks by default, starting on the Monday of the start week', () => {
    const p = plan(runner, { kind: 'fitness' }, week, '2026-10-21');
    expect(p.weeks).toHaveLength(12);
    expect(p.weeks[0]).toMatchObject({ startDate: '2026-10-19', isPartial: true });
    expect(p.weeks[0]?.workouts.every((w) => w.date >= '2026-10-21')).toBe(true);
    expect(p.weeks[1]?.isPartial).toBe(false);
    expect(p.targetDate).toBeNull();
  });

  it('ends with the race: no training on race day and no hard session the day before', () => {
    const p = plan(runner, { kind: 'half' }, week, '2026-10-19', '2027-01-17');
    const last = p.weeks.at(-1) as Plan['weeks'][number];
    expect(last.phase).toBe('taper');
    expect(last.workouts.every((w) => w.date < '2027-01-17')).toBe(true);
    expect(last.workouts.filter((w) => w.date === '2027-01-16').some((w) => w.hard)).toBe(false);
    expect(p.notes).toEqual([]);
  });

  it('race on a Monday: the Sunday before stays easy', () => {
    const p = plan(runner, { kind: '10k' }, week, '2026-10-19', '2027-01-18');
    expect(
      p.weeks
        .at(-1)
        ?.workouts.filter((w) => w.date === '2027-01-17')
        .some((w) => w.hard),
    ).toBe(false);
  });

  it('warns about short race preparations', () => {
    const p = plan(runner, { kind: 'marathon' }, week, '2026-10-19', '2026-12-20');
    expect(p.notes).toEqual([
      { key: 'notes.shortPreparation', params: { weeks: 9, recommended: 14 } },
    ]);
  });

  it('labels recovery and taper weeks and fills workouts with steps, targets and why texts', () => {
    const p = plan(runner, { kind: 'half' }, week, '2026-10-19', '2027-01-17');
    expect(p.weeks.find((w) => w.isRecovery)?.notes[0]).toEqual({ key: 'notes.recoveryWeek' });
    expect(p.weeks.at(-1)?.notes[0]).toEqual({ key: 'notes.taperWeek' });
    for (const w of p.weeks.flatMap((x) => x.workouts)) {
      expect(w.durationMin).toBeGreaterThan(0);
      expect(w.load).toBeGreaterThan(0);
      expect(w.main.length).toBeGreaterThan(0);
      expect(w.whyKey).toMatch(/^why\./);
      expect(w.id.startsWith(w.date)).toBe(true);
    }
    const strength = p.weeks.flatMap((x) => x.workouts).find((w) => w.sport === 'strength');
    expect(strength?.exercises?.length).toBeGreaterThan(0);
  });

  it('schedules benchmarks in the first full week and every 6 weeks, unless turned off', () => {
    const tri: UserProfile = {
      ...runner,
      sports: ['swim', 'bike', 'run'],
      hasPowerMeter: true,
      strength: { mode: 'none' },
    };
    const big: Availability = {
      minutesPerDay: [90, 90, 90, 90, 90, 300, 180],
      doublesAllowed: true,
    };
    const p = plan(tri, { kind: 'tri_70_3' }, big, '2026-10-19', '2027-04-25');
    const weeksWithTests = p.weeks
      .filter((w) => w.workouts.some((x) => x.role === 'benchmark'))
      .map((w) => w.index);
    expect(weeksWithTests[0]).toBe(0);
    expect(weeksWithTests[1]).toBe(6);
    const off = plan(
      { ...tri, benchmarks: false },
      { kind: 'tri_70_3' },
      big,
      '2026-10-19',
      '2027-04-25',
    );
    expect(off.weeks.flatMap((w) => w.workouts).some((x) => x.role === 'benchmark')).toBe(false);
  });

  it('progresses levels and the long session over loading weeks', () => {
    const p = plan(
      { ...runner, strength: { mode: 'none' } },
      { kind: 'marathon' },
      week,
      '2026-10-19',
      '2027-04-25',
    );
    const longs = p.weeks
      .slice(0, 3)
      .map((w) => w.workouts.find((x) => x.role === 'long')?.durationMin);
    expect(longs).toEqual([60, 70, 80]);
    const recoveryLong = p.weeks[3]?.workouts.find((x) => x.role === 'long')?.durationMin as number;
    expect(recoveryLong).toBeLessThan(80);
  });

  it('beginner swimmers do technique first, CSS sets once technique progressed to L4', () => {
    const swimmer: UserProfile = {
      ...runner,
      experience: 'beginner',
      sports: ['swim'],
      canSwim400m: true,
      strength: { mode: 'none' },
    };
    const days: Availability = { minutesPerDay: [45, 0, 45, 0, 45, 60, 0], doublesAllowed: false };
    const p = plan(swimmer, { kind: 'swim' }, days, '2026-10-19', '2027-03-28');
    const firstCss = p.weeks.findIndex((w) => w.workouts.some((x) => x.templateId === 'swim.css'));
    const technique = p.weeks
      .slice(0, firstCss)
      .flatMap((w) => w.workouts)
      .filter((x) => x.templateId === 'swim.technique');
    expect(firstCss).toBeGreaterThan(2);
    // CSS unlocks when the technique progression reaches L4 (after the L3 session).
    expect(Math.max(...technique.map((x) => x.level ?? 0))).toBeGreaterThanOrEqual(3);
    const cannot = plan(
      { ...swimmer, canSwim400m: false },
      { kind: 'swim' },
      days,
      '2026-10-19',
      '2027-03-28',
    );
    expect(cannot.weeks.flatMap((w) => w.workouts).some((x) => x.templateId === 'swim.css')).toBe(
      false,
    );
  });

  it('offers winter variants inside the winter period', () => {
    const p = plan({ ...runner, winterSports: ['xcski'] }, { kind: 'fitness' }, week, '2026-11-30');
    const december =
      p.weeks[1]?.workouts.filter((w) => w.sport === 'run' && w.role !== 'key') ?? [];
    expect(december.length).toBeGreaterThan(0);
    expect(december.every((w) => w.winterVariant?.sport === 'xcski')).toBe(true);
  });
});
