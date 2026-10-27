import { describe, expect, it } from 'vitest';

import {
  allWorkouts,
  findWorkout,
  hasManualChanges,
  moveWorkout,
  newPlanState,
  resetWeek,
  setWeekOverride,
  setTravel,
  setWorkoutStatus,
  type PlanInput,
  type PlanState,
} from './edit';
import { grid } from './fixtures';
import { generatePlan } from './generate';
import { indoorVersion } from './indoor';
import { historyByMonth, performance, weekProgress, weekTags, workoutKm } from './summary';
import type { Plan, PlanWeek, Workout } from './types';
import { annotateWeeks, weekKind } from './week-facts';
import {
  describeWorkout,
  durationRange,
  normalizePlan,
  paceLimitSecPerKm,
  paceMode,
  typeColorKey,
  WORKOUT_TYPES,
  workoutType,
} from './workout-type';

/**
 * Derived UI fields and the figures of the Today / Plan / Calendar / Progress screens (CLAUDE.md
 * "UI patterns"). Same base plan as edit.test.ts: intermediate runner, half marathon on
 * 2027-02-14, plan from Monday 2026-10-19. Week 2: Mon 10-26 easy · Tue strength · Wed easy ·
 * Thu strength · Sat long · Sun fartlek.
 */

const input: PlanInput = {
  profile: {
    age: 35,
    experience: 'intermediate',
    sports: ['run'],
    terrain: 'flat',
    strength: { mode: 'peakr', equipment: 'gym' },
  },
  goal: { kind: 'half' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  targetDate: '2027-02-14',
};
const START = '2026-10-19';
const WEEK2 = '2026-10-26';

function ok<T>(r: { ok: true; value: T } | { ok: false; issues: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const plan: Plan = ok(
  generatePlan(input.profile, input.goal, input.availability, START, input.targetDate),
);
const state: PlanState = newPlanState(plan);
const weekAt = (p: Plan, start: string) => p.weeks.find((w) => w.startDate === start) as PlanWeek;
const workout = (id: string, p: Plan = plan) => findWorkout(p, id) as Workout;

describe('workout type and colour', () => {
  it('every generated workout carries type, colour token, range and pace mode', () => {
    for (const c of grid()) {
      const r = generatePlan(c.profile, { kind: c.goal }, c.availability, c.start, c.target);
      if (!r.ok) continue;
      for (const w of allWorkouts(r.value)) {
        expect(WORKOUT_TYPES, c.name).toContain(w.type);
        expect(w.colorKey).toBe(typeColorKey(w.type));
        expect(w.duration.minMin).toBeLessThanOrEqual(w.durationMin);
        expect(w.duration.maxMin).toBeGreaterThanOrEqual(w.durationMin);
        expect(w.duration.maxMin - w.duration.minMin).toBeLessThanOrEqual(
          Math.max(5, w.durationMin * 0.16 + 2.5),
        );
        if (w.type === 'easy' || w.type === 'long') expect(w.paceMode).toBe('limit');
        if (w.type === 'intervals') expect(w.paceMode).toBe('target');
      }
    }
  });

  it('maps kinds onto the UI types', () => {
    const t = (
      templateId: string,
      sport: Workout['sport'] = 'run',
      role: Workout['role'] = 'easy',
    ) => workoutType({ templateId, sport, role });
    expect(t('run.easy')).toBe('easy');
    expect(t('run.long', 'run', 'long')).toBe('long');
    expect(t('bike.sweetspot', 'bike')).toBe('tempo');
    expect(t('run.vo2_intervals')).toBe('intervals');
    expect(t('swim.speed', 'swim')).toBe('intervals');
    expect(t('swim.technique', 'swim')).toBe('easy');
    expect(t('run.hills_short')).toBe('hills');
    expect(t('bench.run_5k', 'run', 'benchmark')).toBe('test');
    expect(t('strength.full_a', 'strength', 'strength')).toBe('strength');
    expect(t('brick', 'brick', 'brick')).toBe('tempo');
    expect(t('xcski.intervals', 'xcski')).toBe('cross');
    expect(t('run.easy', 'run', 'commute')).toBe('commute');
    expect(typeColorKey('intervals')).toBe('typeIntervals');
  });

  it('pace is a limit for easy, long and winter sessions, a target otherwise', () => {
    expect(paceMode({ intensity: 'recovery', type: 'easy' })).toBe('limit');
    expect(paceMode({ intensity: 'moderate', type: 'long' })).toBe('limit');
    expect(paceMode({ intensity: 'moderate', type: 'cross' })).toBe('limit');
    expect(paceMode({ intensity: 'moderate', type: 'commute' })).toBe('limit');
    expect(paceMode({ intensity: 'moderate', type: 'easy' })).toBe('limit');
    expect(paceMode({ intensity: 'hard', type: 'tempo' })).toBe('target');
  });

  it('easy runs get a "no faster than" pace from the easy pace', () => {
    const limit = paceLimitSecPerKm({ sport: 'run', paceMode: 'limit' }, input.profile);
    expect(limit).toBeGreaterThan(300);
    const faster = { ...input.profile, thresholdPaceSecPerKm: 240 };
    expect(paceLimitSecPerKm({ sport: 'run', paceMode: 'limit' }, faster)).toBeLessThan(
      limit as number,
    );
    expect(paceLimitSecPerKm({ sport: 'run', paceMode: 'target' }, input.profile)).toBeNull();
    expect(paceLimitSecPerKm({ sport: 'bike', paceMode: 'limit' }, input.profile)).toBeNull();
  });
});

describe('duration range', () => {
  const easy = workout('2026-10-26-1');
  const strength = workout('2026-10-27-1');
  const fartlek = workout('2026-11-01-1');

  it('time-scaled sessions get about ±8 % in steps of 5', () => {
    expect(durationRange({ ...easy, level: null, durationMin: 50 })).toEqual({
      minMin: 45,
      maxMin: 55,
    });
    expect(durationRange({ ...easy, level: null, durationMin: 32 })).toEqual({
      minMin: 30,
      maxMin: 35,
    });
    // Too short to round apart: one 5-minute step.
    expect(durationRange({ ...easy, level: null, durationMin: 20 })).toEqual({
      minMin: 20,
      maxMin: 25,
    });
    expect(durationRange({ ...easy, level: null, durationMin: 3 })).toEqual({
      minMin: 3,
      maxMin: 8,
    });
  });

  it('structured sessions flex only in warm-up and cool-down', () => {
    const r = durationRange(fartlek);
    expect(fartlek.level).not.toBeNull();
    expect(r.minMin).toBeLessThanOrEqual(fartlek.durationMin);
    expect(r.maxMin - r.minMin).toBeLessThanOrEqual(Math.ceil(fartlek.durationMin * 0.2));
  });

  it('strength like time-scaled sessions, commutes are fixed', () => {
    expect(durationRange({ ...strength, durationMin: 45 })).toEqual({ minMin: 45, maxMin: 50 });
    expect(durationRange({ ...strength, durationMin: 60 })).toEqual({ minMin: 55, maxMin: 65 });
    expect(durationRange({ ...easy, role: 'commute', durationMin: 25 })).toEqual({
      minMin: 25,
      maxMin: 25,
    });
  });

  it('never goes below 5 minutes', () => {
    expect(durationRange({ ...strength, durationMin: 6 }).minMin).toBe(5);
  });
});

describe('normalizePlan', () => {
  it('upgrades plans stored with the template type in `type`', () => {
    const legacy = {
      ...plan,
      weeks: plan.weeks.map((w) => ({
        ...w,
        workouts: w.workouts.map((x) => {
          const old: Partial<Omit<Workout, 'type'>> & { type: string } = {
            ...x,
            type: x.templateType,
          };
          delete old.templateType;
          delete old.colorKey;
          delete old.duration;
          delete old.paceMode;
          return old;
        }),
      })),
    } as unknown as Plan;
    expect(normalizePlan(legacy, input.profile)).toEqual(plan);
    expect(normalizePlan(plan, input.profile)).toEqual(plan);
  });

  it('fills the week figures of plans stored before they existed', () => {
    const legacy = {
      ...plan,
      weeks: plan.weeks.map((w) => {
        const old: Partial<PlanWeek> = { ...w };
        delete old.number;
        delete old.distanceKm;
        delete old.kind;
        return old;
      }),
    } as unknown as Plan;
    expect(normalizePlan(legacy, input.profile)).toEqual(plan);
  });

  it('describeWorkout recomputes derived fields', () => {
    const easy = workout('2026-10-26-1');
    expect(describeWorkout({ ...easy, type: 'hills', durationMin: 50 }).type).toBe('easy');
  });
});

describe('reset week', () => {
  it('undoes manual moves of the week and keeps status', () => {
    expect(hasManualChanges(state, WEEK2)).toBe(false);
    const moved = ok(moveWorkout(state, '2026-10-26-1', '2026-10-30', input, START)).state;
    const done = ok(setWorkoutStatus(moved, '2026-10-26-1', 'done'));
    expect(workout('2026-10-26-1', done.plan)).toMatchObject({
      date: '2026-10-30',
      originalDate: '2026-10-26',
    });
    expect(hasManualChanges(done, WEEK2)).toBe(true);
    const reset = ok(resetWeek(done, WEEK2, input));
    const back = workout('2026-10-26-1', reset.plan);
    expect(back.date).toBe('2026-10-26');
    expect(back.weekday).toBe(0);
    expect(back.originalDate).toBeUndefined();
    expect(reset.status['2026-10-26-1']).toBe('done');
    expect(hasManualChanges(reset, WEEK2)).toBe(false);
  });

  it('a workout moved to another week counts for both weeks', () => {
    const moved = ok(moveWorkout(state, '2026-10-26-1', '2026-11-03', input, START)).state;
    expect(hasManualChanges(moved, WEEK2)).toBe(true);
    expect(hasManualChanges(moved, '2026-11-02')).toBe(true);
    const reset = ok(resetWeek(moved, '2026-11-02', input));
    expect(workout('2026-10-26-1', reset.plan).date).toBe('2026-10-26');
  });

  it('moving back to the original day clears the mark', () => {
    const there = ok(moveWorkout(state, '2026-10-26-1', '2026-10-30', input, START)).state;
    const back = ok(moveWorkout(there, '2026-10-26-1', '2026-10-26', input, START)).state;
    expect(workout('2026-10-26-1', back.plan).originalDate).toBeUndefined();
  });

  it('is a no-op without changes and refuses invalid dates', () => {
    expect(ok(resetWeek(state, WEEK2, input))).toBe(state);
    expect(resetWeek(state, 'nope', input).ok).toBe(false);
  });
});

describe('indoor version', () => {
  const easy = workout('2026-10-26-1');
  const strength = workout('2026-10-27-1');

  it('runs go on the treadmill with an incline from the terrain', () => {
    const v = indoorVersion(easy);
    expect(v).toMatchObject({ kind: 'treadmill', inclinePct: 1, load: easy.load });
    expect(v?.main).toBe(easy.main);
    expect(indoorVersion({ ...easy, terrain: null })?.inclinePct).toBe(1);
    const hilly = { gainPerKm: 45, distanceKm: 10, expectedGainM: 450, eccentric: false };
    expect(indoorVersion({ ...easy, terrain: hilly })?.inclinePct).toBe(5);
    const steep = { ...hilly, gainPerKm: 200 };
    expect(indoorVersion({ ...easy, terrain: steep })?.inclinePct).toBe(8);
  });

  it('hill reps become incline reps, rests stay', () => {
    const rep = {
      durationSec: 60,
      zone: 4 as const,
      target: { kind: 'hrZone' as const, value: 'Z4' },
    };
    const hills: Workout = {
      ...easy,
      type: 'hills',
      main: [{ repeat: 6, steps: [rep, { ...rep, zone: 1, rest: true }] }],
    };
    const v = indoorVersion(hills);
    expect(v?.inclinePct).toBe(6);
    expect(v?.main[0]?.steps[0]?.noteKey).toBe('steps.indoor.inclineRep');
    expect(v?.main[0]?.steps[1]?.noteKey).toBeUndefined();
  });

  it('bike → trainer, open water → pool, no alternative for strength and commutes', () => {
    expect(indoorVersion({ ...easy, indoorAlternativeId: 'indoor.trainer' })).toMatchObject({
      kind: 'trainer',
      inclinePct: null,
    });
    expect(indoorVersion({ ...easy, indoorAlternativeId: 'indoor.pool' })?.kind).toBe('pool');
    expect(indoorVersion(strength)).toBeNull();
    expect(indoorVersion({ ...easy, indoorAlternativeId: 'indoor.unknown' })).toBeNull();
    expect(indoorVersion({ ...easy, role: 'commute' })).toBeNull();
  });
});

describe('week progress and tags', () => {
  it('counts sessions and km done / planned, skipped ones drop out', () => {
    const week = weekAt(plan, WEEK2);
    const fresh = weekProgress(state, week, input.profile);
    expect(fresh.segments).toHaveLength(6);
    expect(fresh.sessionsDone).toBe(0);
    expect(fresh.sessionsPlanned).toBe(6);
    expect(fresh.kmPlanned).toBeGreaterThan(0);
    expect(fresh.complete).toBe(false);
    expect(fresh.minMin).toBeLessThanOrEqual(week.minutes);
    expect(fresh.maxMin).toBeGreaterThanOrEqual(week.minutes);

    let s = state;
    for (const w of week.workouts) s = ok(setWorkoutStatus(s, w.id, 'done'));
    s = ok(setWorkoutStatus(s, '2026-10-27-1', 'skipped'));
    const p = weekProgress(s, week, input.profile);
    expect(p.sessionsDone).toBe(5);
    expect(p.sessionsPlanned).toBe(5);
    expect(p.kmDone).toBe(p.kmPlanned);
    expect(p.complete).toBe(true);
    expect(p.segments.find((x) => x.workoutId === '2026-10-27-1')?.status).toBe('skipped');
  });

  it('commutes add km but are no session', () => {
    const week = weekAt(plan, WEEK2);
    const easy = week.workouts[0] as Workout;
    const commute: Workout = { ...easy, id: 'c1', role: 'commute', commuteId: 'x' };
    const p = weekProgress(
      state,
      { ...week, workouts: [...week.workouts, commute] },
      input.profile,
    );
    expect(p.segments).toHaveLength(6);
    expect(p.kmPlanned).toBeGreaterThan(weekProgress(state, week, input.profile).kmPlanned);
  });

  it('tags recovery, taper, race, travel and irregular weeks', () => {
    const recovery = plan.weeks.find((w) => w.isRecovery) as PlanWeek;
    expect(weekTags(recovery, input, plan.targetDate)).toContain('recovery');
    const last = plan.weeks[plan.weeks.length - 1] as PlanWeek;
    expect(weekTags(last, input, plan.targetDate)).toEqual(['taper', 'race']);
    const week = weekAt(plan, WEEK2);
    expect(weekTags(week, input, null)).toEqual([]);

    const travel = ok(
      setTravel(state, input, [{ startDate: '2026-10-27', endDate: '2026-10-28' }], START),
    );
    expect(weekTags(week, travel.input, null)).toEqual(['travel']);
    const different = ok(
      setWeekOverride(state, input, WEEK2, { blockedDates: ['2026-10-26'] }, START),
    );
    expect(weekTags(week, different.input, null)).toEqual(['different']);
  });
});

describe('week figures (PlanWeek number, distance, kind)', () => {
  it('numbers the weeks from 1', () => {
    expect(plan.weeks.map((w) => w.number)).toEqual(plan.weeks.map((_, i) => i + 1));
  });

  it('sums the planned distance of the week, commutes included', () => {
    const week = weekAt(plan, WEEK2);
    expect(week.distanceKm).toBe(weekProgress(state, week, input.profile).kmPlanned);
    expect(week.distanceKm).toBeGreaterThan(0);
    expect(week.minutes).toBe(week.workouts.reduce((sum, w) => sum + w.durationMin, 0));
  });

  it('marks recovery, race and normal weeks', () => {
    const recovery = plan.weeks.find((w) => w.isRecovery) as PlanWeek;
    expect(recovery.kind).toBe('recovery');
    expect((plan.weeks[plan.weeks.length - 1] as PlanWeek).kind).toBe('race');
    expect(weekAt(plan, WEEK2).kind).toBe('normal');
  });

  it('race beats travel, travel beats recovery', () => {
    const recovery = plan.weeks.find((w) => w.isRecovery) as PlanWeek;
    const travelNote = { key: 'notes.travelWeek' };
    expect(weekKind({ ...recovery, notes: [travelNote] }, null)).toBe('travel');
    expect(weekKind({ ...recovery, notes: [travelNote] }, recovery.startDate)).toBe('race');
    expect(weekKind(recovery, null)).toBe('recovery');
  });

  it('is recomputed after edits', () => {
    const travel = ok(
      setTravel(state, input, [{ startDate: '2026-10-27', endDate: '2026-10-28' }], START),
    );
    expect(weekAt(travel.state.plan, WEEK2).kind).toBe('travel');

    const week = weekAt(plan, WEEK2);
    const run = week.workouts.find((w) => w.sport === 'run') as Workout;
    const moved = ok(moveWorkout(state, run.id, '2026-11-03', input, START)).state;
    expect(weekAt(moved.plan, WEEK2).distanceKm).toBeLessThan(week.distanceKm);
    expect(annotateWeeks(moved.plan, input.profile)).toEqual(moved.plan);
  });
});

describe('history and performance', () => {
  const ids = ['2026-10-19-1', '2026-10-26-1', '2026-10-27-1', '2026-10-31-1', '2026-11-03-1'];
  const src = (st: PlanState, planId = 'p1') => [{ planId, state: st, profile: input.profile }];
  let done = state;
  for (const id of ids) {
    if (findWorkout(plan, id)) done = ok(setWorkoutStatus(done, id, 'done'));
  }

  it('groups completed sessions by month, newest first, with totals', () => {
    expect(historyByMonth(src(state))).toEqual([]);
    const months = historyByMonth(src(done));
    expect(months.map((m) => m.month)).toEqual(['2026-11', '2026-10']);
    const oct = months[1];
    expect((oct?.entries[0]?.workout.date ?? '') >= (oct?.entries[1]?.workout.date ?? '')).toBe(
      true,
    );
    expect(oct?.minutes).toBe(oct?.entries.reduce((s, e) => s + e.minutes, 0));
    const run = oct?.entries.find((e) => e.workout.sport === 'run');
    expect(run?.paceSecPerKm).toBeGreaterThan(200);
    const strength = oct?.entries.find((e) => e.workout.sport === 'strength');
    expect(strength?.paceSecPerKm).toBeNull();
    expect(strength?.km).toBe(0);
  });

  it('runs without distance have no pace; commutes are no session', () => {
    const easy = workout('2026-10-26-1');
    const empty: Workout = {
      ...easy,
      id: 'e',
      warmup: [],
      main: [],
      cooldown: [],
      role: 'commute',
    };
    const p: Plan = {
      ...plan,
      weeks: [{ ...weekAt(plan, WEEK2), workouts: [empty] }],
    };
    const s = ok(setWorkoutStatus(newPlanState(p), 'e', 'done'));
    const [month] = historyByMonth(src(s));
    expect(month?.entries[0]?.paceSecPerKm).toBeNull();
    expect(month?.sessions).toBe(0);
    expect(workoutKm(empty, input.profile)).toBe(0);
  });

  it('weekly bars with average, totals and personal bests', () => {
    const perf = performance(src(done), '2026-11-04', 4);
    expect(perf.weeks.map((w) => w.weekStart)).toEqual([
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
    ]);
    expect(perf.weeks[0]?.minutes).toBe(0);
    const sum = perf.weeks.reduce((s, w) => s + w.minutes, 0);
    expect(perf.averageMinutes).toBe(Math.round(sum / 4));
    expect(perf.period.minutes).toBe(sum);
    expect(perf.lifetime.sessions).toBe(perf.period.sessions);
    expect(perf.bests.longestSession?.workout.id).toBe('2026-10-31-1');
    expect(perf.bests.biggestWeek?.weekStart).toBe('2026-10-26');
    expect(perf.bests.longestKm.run).toBeGreaterThan(10);

    // A shorter period leaves older sessions out of the period but not of the lifetime.
    const short = performance(src(done), '2026-11-04', 1);
    expect(short.period.sessions).toBeLessThan(short.lifetime.sessions);
    // Sessions after today are not in the period.
    const early = performance(src(done), '2026-10-20', 1);
    expect(early.period.sessions).toBe(1);

    const none = performance(src(state), '2026-11-04', 4);
    expect(none.bests).toEqual({ longestSession: null, biggestWeek: null, longestKm: {} });
    expect(none.averageMinutes).toBe(0);
  });

  it('"This plan" vs "All time": bests and lifetime always over every plan', () => {
    // An archived plan whose sessions all happened before the current one.
    const archived = src(done, 'old');
    const current = src(state, 'new');
    const all = [...current, ...archived];
    const months = historyByMonth(all);
    expect(months.flatMap((m) => m.entries).every((e) => e.planId === 'old')).toBe(true);
    const thisPlan = performance(current, '2026-11-04', 4, all);
    expect(thisPlan.period.sessions).toBe(0);
    expect(thisPlan.lifetime.sessions).toBe(
      performance(archived, '2026-11-04', 4).lifetime.sessions,
    );
    expect(thisPlan.bests.longestSession?.planId).toBe('old');
    expect(performance(all, '2026-11-04', 4).period.sessions).toBeGreaterThan(0);
  });
});
