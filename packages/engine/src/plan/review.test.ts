import { describe, expect, it } from 'vitest';

import { composeWeek, type CompositionContext } from './composition';
import type { PlanState } from './edit';
import { startFloors } from './floors';
import { generatePlan } from './generate';
import { applyReview, planReview, reviewAdjustments, type ReviewAnswers } from './review';
import type { Availability, GoalKind, UserProfile, Workout } from './types';

const profile: UserProfile = {
  age: 35,
  experience: 'intermediate',
  sports: ['run'],
  terrain: 'rolling',
  strength: { mode: 'peakr' },
};
const availability: Availability = {
  minutesPerDay: [60, 60, 45, 60, 0, 120, 90],
  doublesAllowed: false,
};
const TODAY = '2026-12-16';

function state(share = 1, skipTempo = false): PlanState {
  const r = generatePlan(profile, { kind: 'half' }, availability, '2026-10-05', '2027-03-14');
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  const past = r.value.weeks.flatMap((w) => w.workouts).filter((w) => w.date < TODAY);
  const n = Math.round(past.length * share);
  return {
    plan: r.value,
    status: Object.fromEntries(
      past.map((w, i) => [
        w.id,
        skipTempo && w.templateId === 'run.tempo' ? 'skipped' : i < n ? 'done' : 'skipped',
      ]),
    ),
    pauses: [],
    revision: 0,
  };
}
const sessions = (s: PlanState) => s.plan.weeks.flatMap((w) => w.workouts);

describe('plan review: what the plan measured', () => {
  it('completion, load share, most skipped, missed weeks and pauses', () => {
    const s = state(0.7, true);
    const r = planReview(s, profile, TODAY);
    expect(r.summary.completion).toBeLessThan(0.75);
    expect(r.loadShare).toBeGreaterThan(0);
    expect(r.loadShare).toBeLessThan(1);
    expect(r.mostSkipped[0]?.count).toBeGreaterThanOrEqual(2);
    expect(r.mostSkipped.length).toBeLessThanOrEqual(3);
    // The last 30 % were skipped: the last weeks count as missed.
    expect(r.missedWeeks).toBeGreaterThan(0);
    expect(r.pauses).toBe(0);
    expect(r.easyPace).toBeNull();
    expect(r.longEasyShare).toBeNull();
    // Nothing planned yet: no share.
    expect(planReview(s, profile, '2026-10-01').loadShare).toBeNull();
  });

  it('downgraded quality sessions are counted', () => {
    const s = state();
    const first = sessions(s).find((w) => w.date < TODAY) as Workout;
    const noted = { ...first, notes: [{ key: 'notes.downgraded' }] };
    const week = s.plan.weeks[0] as PlanState['plan']['weeks'][number];
    const one = {
      ...s,
      plan: {
        ...s.plan,
        weeks: [
          { ...week, workouts: [noted, ...week.workouts.slice(1)] },
          ...s.plan.weeks.slice(1),
        ],
      },
    };
    expect(planReview(one, profile, TODAY).qualityDowngraded).toBe(
      planReview(s, profile, TODAY).qualityDowngraded + 1,
    );
  });

  it('easy pace first vs last third and long runs in the easy band – only with enough data', () => {
    const s = state();
    const past = sessions(s).filter((w) => w.date < TODAY && w.sport === 'run');
    const easy = past.filter((w) => w.role === 'easy');
    const longs = past.filter((w) => w.role === 'long');
    expect(easy.length).toBeGreaterThanOrEqual(9);
    const linked = [
      // Pace improves from 6:30 to 6:00 per km.
      ...easy.map((w, i) => ({
        workoutId: w.id,
        durationSec: i < easy.length / 2 ? 390 * 8 : 360 * 8,
        distanceM: 8000,
        avgHr: 140,
      })),
      ...longs.map((w, i) => ({
        workoutId: w.id,
        durationSec: 5400,
        distanceM: 14_000,
        avgHr: i % 2 ? 150 : 165,
      })),
      // Not part of the plan, or without distance / HR: ignored.
      { workoutId: 'other', durationSec: 1000, distanceM: 3000, avgHr: 150 },
      { workoutId: (easy[0] as Workout).id, durationSec: 1000, distanceM: null, avgHr: null },
    ];
    const r = planReview(s, profile, TODAY, linked, 155);
    expect(r.easyPace).toEqual({ first: 390, last: 360 });
    expect(r.longEasyShare).toBe(
      Math.round((longs.filter((_, i) => i % 2).length / longs.length) * 100) / 100,
    );
  });
});

describe('plan review: what the answers change', () => {
  const review = (share: number) => planReview(state(share), profile, TODAY);
  const adjust = (share: number, answers: ReviewAnswers, p: Partial<UserProfile> = {}) =>
    reviewAdjustments(review(share), answers, { ...profile, ...p });
  const keys = (c: ReturnType<typeof adjust>) => c.lines.map((l) => l.key);

  it('levels: up after ≥ 80 % done and "right"/"too easy", down when too hard or < 60 %', () => {
    expect(adjust(0.9, { overall: 'right' }).levelShift).toBe(1);
    expect(adjust(0.9, { overall: 'tooEasy' })).toMatchObject({ levelShift: 1, difficulty: 6 });
    expect(adjust(0.9, {})).toMatchObject({ levelShift: 0 });
    expect(keys(adjust(0.9, {}))).toEqual(['levelsHold']);
    expect(adjust(0.9, { overall: 'tooHard' })).toMatchObject({ levelShift: -1, difficulty: 4 });
    expect(keys(adjust(0.5, {}))).toEqual(['levelsDownDone']);
    expect(adjust(0.5, {}).lines[0]?.params?.percent).toBe(
      Math.round(review(0.5).summary.completion * 100),
    );
    // Difficulty never leaves 1–10.
    expect(adjust(0.9, { overall: 'tooEasy' }, { difficulty: 10 }).difficulty).toBeNull();
    expect(adjust(0.9, { overall: 'tooHard' }, { difficulty: 1 }).difficulty).toBeNull();
    // Nothing done at all: nothing to say about levels.
    const empty = reviewAdjustments(planReview(state(0), profile, '2026-10-01'), {}, profile);
    expect(empty.lines).toEqual([]);
  });

  it('quality mix, strength, long run and time', () => {
    expect(adjust(0.9, { wishes: ['moreIntervals'] }).qualityEmphasis).toBe('more');
    expect(adjust(0.9, { quality: 'tooMuch' }).qualityEmphasis).toBe('less');
    expect(adjust(0.9, { quality: 'tooLittle', wishes: ['moreVolume'] }).qualityEmphasis).toBe(
      'balanced',
    );
    expect(adjust(0.9, { wishes: ['moreStrength'] }).strengthPriority).toBe('strengthFirst');
    const none = adjust(0.9, { wishes: ['moreStrength'] }, { strength: { mode: 'none' } });
    expect(none.strengthPriority).toBeNull();
    expect(keys(none)).toContain('strengthChoose');
    expect(adjust(0.9, { long: 'tooLong' }).long).toBe('shorter');
    expect(adjust(0.9, { long: 'tooShort' }).long).toBe('longer');
    expect(adjust(0.9, { long: 'good' }).long).toBeNull();
    expect(keys(adjust(0.9, { time: 'tooMuch' }))).toContain('timeHint');
    expect(keys(adjust(0.9, { time: 'tooLittle' }))).toContain('timeHint');
    expect(keys(adjust(0.9, { wishes: ['fewerDays'] }))).toContain('timeHint');
    expect(keys(adjust(0.9, { time: 'right' }))).not.toContain('timeHint');
  });

  it('a break because of complaints: start lower on purpose, no floors, nothing harder', () => {
    const c = adjust(0.9, { breakForComplaints: true, overall: 'tooEasy', long: 'tooShort' });
    expect(c).toMatchObject({
      returnAfterBreak: true,
      levelShift: -1,
      difficulty: null,
      long: null,
    });
    expect(c.lines[0]).toEqual({ key: 'returnAfterBreak', params: { percent: 80 } });
  });
});

describe('applyReview', () => {
  const base: UserProfile = {
    ...profile,
    difficulty: 5,
    recentLongest: { run: { km: 10 } },
    baseline: {
      longMin: { run: 100 },
      longKm: { run: 16 },
      weeklyMin: { run: 240 },
      startLoad: 600,
      levels: { 'run.tempo': 4, 'run.fartlek': 1 },
    },
  };
  const changes = (extra: Partial<ReturnType<typeof reviewAdjustments>> = {}) => ({
    levelShift: 0 as const,
    difficulty: null,
    qualityEmphasis: 'balanced' as const,
    strengthPriority: null,
    long: null,
    returnAfterBreak: false,
    lines: [],
    ...extra,
  });

  it('levels, difficulty (only when accepted), quality mix and strength priority', () => {
    const up = applyReview(
      base,
      changes({
        levelShift: 1,
        difficulty: 6,
        qualityEmphasis: 'more',
        strengthPriority: 'strengthFirst',
      }),
      true,
    );
    expect(up.baseline?.levels).toEqual({ 'run.tempo': 5, 'run.fartlek': 2 });
    expect(up).toMatchObject({
      difficulty: 6,
      qualityEmphasis: 'more',
      strength: { priority: 'strengthFirst' },
    });
    const down = applyReview(base, changes({ levelShift: -1, difficulty: 4 }), false);
    expect(down.baseline?.levels).toEqual({ 'run.tempo': 3, 'run.fartlek': 1 });
    expect(down.difficulty).toBe(5);
    expect(applyReview(profile, changes(), true).baseline).toEqual({});
  });

  it('long run longer by 10 %, or shorter down to the floor – never below it', () => {
    expect(applyReview(base, changes({ long: 'longer' }), true).baseline?.longMin).toEqual({
      run: 110,
    });
    const shorter = applyReview(base, changes({ long: 'shorter' }), true);
    expect(shorter.baseline?.longMin).toEqual({ run: 90 });
    // The floor still comes from the usual 100 minutes.
    expect(startFloors(shorter).longMin.run).toBe(90);
    expect(startFloors(base).longMin.run).toBe(90);
    // Without a long-run baseline nothing changes.
    expect(
      applyReview({ ...base, baseline: {} }, changes({ long: 'longer' }), true).baseline,
    ).toEqual({});
  });

  it('a return after complaints starts at 80 % and builds below the old floors', () => {
    const back = applyReview(base, changes({ returnAfterBreak: true, levelShift: -1 }), true);
    expect(back.baseline).toEqual({ startLoad: 480, levels: { 'run.tempo': 3, 'run.fartlek': 1 } });
    expect(back.recentLongest).toBeUndefined();
    expect(startFloors(back)).toEqual({ longMin: {}, weeklyMin: {} });
    const tight: Availability = { minutesPerDay: [30, 0, 30, 0, 0, 45, 0], doublesAllowed: false };
    expect(generatePlan(base, { kind: 'half' }, tight, '2026-12-21', '2027-04-25').ok).toBe(false);
    expect(generatePlan(back, { kind: 'half' }, tight, '2026-12-21', '2027-04-25').ok).toBe(true);
    const noLoad = applyReview(
      { ...base, baseline: { levels: {} } },
      changes({ returnAfterBreak: true }),
      true,
    );
    expect(noLoad.baseline?.startLoad).toBeUndefined();
  });
});

describe('quality emphasis in the rotation', () => {
  const ctx = (
    goal: GoalKind,
    q: number,
    emphasis?: UserProfile['qualityEmphasis'],
  ): CompositionContext => ({
    goal,
    profile: {
      ...profile,
      terrain: 'flat',
      experience: 'intermediate',
      ...(emphasis ? { qualityEmphasis: emphasis } : {}),
    },
    phase: 'build',
    weekIndex: 6,
    isRecovery: false,
    raceWeek: false,
    trainingDays: 4,
    cssAllowed: true,
    benchmark: false,
    buildWeekIndex: 0,
    qualityIndex: q,
  });
  const key = (goal: GoalKind, emphasis?: UserProfile['qualityEmphasis']) =>
    [0, 1, 2, 3].map((q) => composeWeek(ctx(goal, q, emphasis), true)[1]?.templateId);

  it('"more intervals" brings VO2 every second loading week, "less" every fourth', () => {
    expect(key('10k')).toEqual(['run.tempo', 'run.tempo', 'run.vo2_intervals', 'run.tempo']);
    expect(key('10k', 'more')).toEqual([
      'run.tempo',
      'run.vo2_intervals',
      'run.tempo',
      'run.vo2_intervals',
    ]);
    expect(key('10k', 'less')).toEqual([
      'run.tempo',
      'run.tempo',
      'run.tempo',
      'run.vo2_intervals',
    ]);
    // 5K: the turn brings threshold, so "more intervals" makes it rarer.
    expect(key('5k', 'more')).toEqual([
      'run.vo2_intervals',
      'run.vo2_intervals',
      'run.vo2_intervals',
      'run.tempo',
    ]);
    expect(key('5k', 'less')).toEqual([
      'run.vo2_intervals',
      'run.tempo',
      'run.vo2_intervals',
      'run.tempo',
    ]);
  });
});
