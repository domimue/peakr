import { describe, expect, it } from 'vitest';

import { calibrateProfile, deriveBaseline, type BaselineActivity } from '../baseline';
import { difficultyFactor, difficultyGrowth, difficultyLevel } from './difficulty';
import { planOutlook, previewDifficulty } from './difficulty-preview';
import { allWorkouts, newPlanState, setWorkoutStatus, statusOf } from './edit';
import { startFloors } from './floors';
import { generatePlan } from './generate';
import type { Availability, Plan, UserProfile } from './types';

const runner: UserProfile = {
  age: 36,
  experience: 'intermediate',
  sports: ['run', 'bike'],
  terrain: 'rolling',
  strength: { mode: 'none' },
};
const availability: Availability = {
  minutesPerDay: [60, 75, 60, 75, 0, 150, 150],
  doublesAllowed: false,
};
const plan = (profile: UserProfile): Plan => {
  const r = generatePlan(profile, { kind: 'half' }, availability, '2026-10-26', '2027-03-28');
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
};
const loadOf = (p: Plan, i: number) => p.weeks[i]?.load ?? 0;

describe('difficulty slider', () => {
  it('maps 1–10 to 0.80–1.20 with 5 as the engine’s own plan', () => {
    expect([1, 5, 10].map(difficultyFactor)).toEqual([0.84, 1, 1.2]);
    expect(difficultyFactor(undefined)).toBe(1);
    expect(difficultyLevel(0)).toBe(1);
    expect(difficultyLevel(42)).toBe(10);
    expect(difficultyLevel(6.6)).toBe(7);
    expect(difficultyLevel(Number.NaN)).toBe(5);
    // Easier settings slow the growth of the loading weeks: hold at 1, +7 % from 5 up.
    expect([1, 3, 5, 10].map((l) => Math.round((difficultyGrowth(l) - 1) * 1000))).toEqual([
      0, 35, 70, 70,
    ]);
    // 5 is exactly what the engine computes today.
    expect(plan({ ...runner, difficulty: 5 })).toEqual(plan(runner));
  });

  it('scales the weekly load target: harder settings plan more, easier less', () => {
    const [low, mid, high] = [1, 5, 10].map((d) => plan({ ...runner, difficulty: d }));
    for (const week of [2, 5]) {
      expect(loadOf(low as Plan, week)).toBeLessThan(loadOf(mid as Plan, week));
      expect(loadOf(mid as Plan, week)).toBeLessThan(loadOf(high as Plan, week));
    }
    // A first week may already sit at the shortest sensible sessions: never more, maybe equal.
    expect(loadOf(low as Plan, 0)).toBeLessThanOrEqual(loadOf(mid as Plan, 0));
    expect(high?.weeks[0]?.difficultyFactor).toBe(1.2);
  });

  it('a low setting never undercuts what the athlete already does', () => {
    let seq = 0;
    const acts: BaselineActivity[] = [
      '08-24',
      '08-31',
      '09-07',
      '09-14',
      '09-21',
      '09-28',
      '10-05',
      '10-12',
    ]
      .map((d) => `2026-${d}`)
      .flatMap((monday) =>
        [1, 3, 6].map((offset, i) => {
          const date = new Date(`${monday}T00:00:00Z`);
          date.setUTCDate(date.getUTCDate() + offset);
          return {
            externalId: `x${++seq}`,
            sport: 'run' as const,
            date: date.toISOString().slice(0, 10),
            durationSec: (i === 2 ? 85 : 45) * 60,
            distanceM: i === 2 ? 14_000 : 7_500,
            elevationGainM: 20,
            avgHr: 145,
            maxHr: 170,
            indoor: false,
            manual: false,
            race: false,
            best20MinHr: null,
          };
        }),
      );
    const profile = calibrateProfile(
      { ...runner, sports: ['run'] },
      deriveBaseline(acts, { today: '2026-10-20', age: 36, hrZones: [] }),
    );
    const easiest = generatePlan(
      { ...profile, difficulty: 1 },
      { kind: 'half' },
      availability,
      '2026-10-26',
      '2027-03-28',
    );
    expect(easiest.ok).toBe(true);
    if (!easiest.ok) return;
    const long = easiest.value.weeks[0]?.workouts.find((w) => w.role === 'long');
    expect(long?.durationMin).toBeGreaterThanOrEqual(startFloors(profile).longMin.run as number);
  });

  it('previews what changes and leaves completed weeks and done sessions alone', () => {
    const base = plan(runner);
    let state = newPlanState(base);
    // The first week is done.
    for (const w of base.weeks[0]?.workouts ?? []) {
      const r = setWorkoutStatus(state, w.id, 'done');
      if (r.ok) state = r.value;
    }
    const input = {
      profile: runner,
      goal: { kind: 'half' as const },
      availability,
      targetDate: '2027-03-28',
    };
    const today = '2026-11-02';
    const r = previewDifficulty(state, input, today, 9);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { before, after } = r.value;
    expect(r.value.level).toBe(9);
    expect(r.value.input.profile.difficulty).toBe(9);
    expect(after.minutesPerWeek.run as number).toBeGreaterThan(before.minutesPerWeek.run as number);
    expect(after.longestMin.run as number).toBeGreaterThanOrEqual(before.longestMin.run as number);
    expect(before.weeks).toBe(4);
    // Week 1 is untouched: same sessions, still done.
    const week1 = base.weeks[0]?.workouts ?? [];
    for (const w of week1) {
      const kept = allWorkouts(r.value.state.plan).find((x) => x.id === w.id);
      expect(kept).toEqual(w);
      expect(statusOf(r.value.state, w.id)).toBe('done');
    }
    // Easier: less.
    const easier = previewDifficulty(state, input, today, 2);
    expect(easier.ok && easier.value.after.minutesPerWeek.run).toBeLessThan(
      before.minutesPerWeek.run as number,
    );
  });

  it('the outlook counts planned sessions per week, minutes, km and the longest per sport', () => {
    const state = newPlanState(plan(runner));
    const o = planOutlook(state, runner, '2026-10-26', 2);
    expect(o.weeks).toBe(2);
    expect(o.sessionsPerWeek).toBeGreaterThan(0);
    expect(Object.keys(o.minutesPerWeek).sort()).toEqual(['bike', 'run']);
    expect(o.kmPerWeek.run).toBeGreaterThan(0);
    expect(o.longestMin.run).toBeGreaterThan(0);
    expect(planOutlook(state, runner, '2030-01-01').weeks).toBe(0);
  });

  it('splits a brick between ride and run and leaves strength out of the volume', () => {
    const p = plan(runner);
    const week = p.weeks[0] as Plan['weeks'][number];
    const [a, b] = week.workouts;
    const edited: Plan = {
      ...p,
      weeks: [
        {
          ...week,
          workouts: [
            { ...(a as (typeof week.workouts)[number]), sport: 'brick', durationMin: 80 },
            { ...(b as (typeof week.workouts)[number]), sport: 'strength', durationMin: 45 },
          ],
        },
      ],
    };
    const o = planOutlook(newPlanState(edited), runner, '2026-10-26', 1);
    expect(o.minutesPerWeek).toEqual({ bike: 40, run: 40 });
    expect(o.longestMin).toEqual({ bike: 80, run: 80 });
    expect(o.sessionsPerWeek).toBe(1);
  });

  it('continues plans made before the slider existed (no factor stored) as difficulty 5', () => {
    const p = plan(runner);
    const old: Plan = {
      ...p,
      weeks: p.weeks.map(({ difficultyFactor: _f, ...w }) => w),
    };
    const input = {
      profile: runner,
      goal: { kind: 'half' as const },
      availability,
      targetDate: '2027-03-28',
    };
    const r = previewDifficulty(newPlanState(old), input, '2026-11-16', 5);
    expect(r.ok && r.value.after.minutesPerWeek.run).toBe(
      r.ok && r.value.before.minutesPerWeek.run,
    );
  });

  it('cannot be applied during a pause', () => {
    const state = {
      ...newPlanState(plan(runner)),
      pauses: [{ reason: 'holiday' as const, startDate: '2026-10-26', endDate: null }],
    };
    const r = previewDifficulty(
      state,
      { profile: runner, goal: { kind: 'half' }, availability },
      '2026-10-27',
      7,
    );
    expect(r.ok).toBe(false);
  });
});
