import { describe, expect, it } from 'vitest';

import { commuteSession, commutesValid } from './commute';
import { summarizeWorkouts } from './distance';
import {
  activeTravel,
  activeWorkouts,
  allWorkouts,
  findViolations,
  newPlanState,
  pausePlan,
  setTravel,
  setWeekOverride,
  setWorkoutStatus,
  weekOverrideOf,
  type PlanInput,
  type PlanState,
} from './edit';
import { grid } from './fixtures';
import { generatePlan } from './generate';
import { equipmentFor } from './strength-equipment';
import { getExercise, hasEquipmentFor } from './library';
import { athleteFor } from './materialize';
import { replacementSport, timeBased, travelOn } from './travel';
import { winterVariantFor } from './winter';
import type {
  Availability,
  Commute,
  Plan,
  PlanWeek,
  SlotRole,
  Sport,
  UserProfile,
  WinterSport,
  Workout,
} from './types';

/**
 * Real life & seasonal adaptation (CLAUDE.md, points 1–3): commutes, irregular weeks, travel mode
 * and winter variants.
 */

const runner: UserProfile = {
  age: 35,
  experience: 'intermediate',
  sports: ['run'],
  terrain: 'flat',
  strength: { mode: 'peakr', equipment: 'gym' },
};
const week: Availability = { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false };
const START = '2026-10-19';
const bikeCommute: Commute = {
  id: 'work',
  sport: 'bike',
  oneWayMin: 25,
  weekdays: [0, 2, 4],
  bothWays: true,
};

function ok<T>(r: { ok: true; value: T } | { ok: false; issues: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

function code(r: { ok: true } | { ok: false; issues: { code: string }[] }): string | null {
  return r.ok ? null : (r.issues[0]?.code ?? null);
}

function plan(input: PlanInput, start = START): Plan {
  return ok(generatePlan(input.profile, input.goal, input.availability, start, input.targetDate));
}

const weekAt = (p: Plan, monday: string) => p.weeks.find((w) => w.startDate === monday) as PlanWeek;
const commutes = (list: readonly Workout[]) => list.filter((w) => w.commuteId !== undefined);
const sessions = (list: readonly Workout[]) => list.filter((w) => w.commuteId === undefined);
const minutesOn = (list: readonly Workout[], date: string) =>
  list.filter((w) => w.date === date).reduce((s, w) => s + w.durationMin, 0);
const SPACING = ['backToBackHard', 'twoHardOneDay', 'heavyLegsBeforeKey', 'heavyLegsAfterDescent'];

// ---------------------------------------------------------------------------------------------

describe('commutes', () => {
  const input: PlanInput = {
    profile: { ...runner, commutes: [bikeCommute] },
    goal: { kind: 'half' },
    availability: week,
    targetDate: '2027-02-14',
  };

  it('a commute is one easy session with a step per leg', () => {
    const s = commuteSession(bikeCommute);
    expect(s.durationMin).toBe(50);
    expect(s.main).toEqual([{ repeat: 2, steps: [expect.objectContaining({ zone: 2 })] }]);
    // 50 min × Z2 (2) × bike 0.75
    expect(s.load).toBe(75);
    const walk = commuteSession({ ...bikeCommute, sport: 'walk', bothWays: false });
    expect(walk).toMatchObject({ durationMin: 25, load: 12.5, target: { value: 'Z1' } });
  });

  it('are placed first on their weekdays, as easy sessions that count towards the load', () => {
    const p = plan(input);
    const w = weekAt(p, '2026-10-26');
    const list = commutes(w.workouts);
    // Wednesday (45 min) is too short for the 50 min commute, Friday has no minutes.
    expect(list.map((c) => c.weekday)).toEqual([0]);
    for (const c of list) {
      expect(c).toMatchObject({
        role: 'commute',
        sport: 'bike',
        templateId: 'bike.commute',
        commuteId: 'work',
        hard: false,
        durationMin: 50,
        load: 75,
      });
    }
    expect(w.load).toBeCloseTo(
      w.workouts.reduce((s, x) => s + x.load, 0),
      0,
    );
    // Monday (60 min) keeps 10 min after the commute: no further session that day.
    expect(sessions(w.workouts).some((x) => x.weekday === 0)).toBe(false);
    expect(w.notes).toContainEqual({ key: 'notes.commuteNoRoom', params: { weekday: 2 } });
  });

  it('add km and minutes to the week but are no training session', () => {
    const w = weekAt(plan(input), '2026-10-26');
    const summary = summarizeWorkouts(w.workouts, input.profile);
    expect(summary.sessions).toBe(sessions(w.workouts).length);
    expect(summary.minutes).toBe(w.workouts.reduce((s, x) => s + x.durationMin, 0));
    expect(summary.distances.bike).toBeGreaterThan(0);
  });

  it('never exceed the availability of a day', () => {
    for (const c of grid().slice(0, 60)) {
      const profile: UserProfile = {
        ...c.profile,
        commutes: [
          { id: 'a', sport: 'bike', oneWayMin: 20, weekdays: [0, 1, 2, 3, 4], bothWays: true },
          { id: 'b', sport: 'walk', oneWayMin: 15, weekdays: [5], bothWays: false },
        ],
      };
      const r = generatePlan(profile, { kind: c.goal }, c.availability, c.start, c.target);
      const p = ok(r);
      for (const w of p.weeks) {
        for (const x of commutes(w.workouts)) {
          expect(minutesOn(w.workouts, x.date)).toBeLessThanOrEqual(
            c.availability.minutesPerDay[x.weekday] as number,
          );
        }
      }
    }
  });

  it('are no session of their own: doubles and same-sport rules ignore them', () => {
    const p = plan({
      ...input,
      profile: { ...runner, sports: ['run', 'bike'], commutes: [bikeCommute] },
      availability: { minutesPerDay: [150, 60, 150, 60, 150, 150, 120], doublesAllowed: false },
      goal: { kind: 'fitness' },
    });
    const all = allWorkouts(p);
    const sharedDays = commutes(all).filter((c) => sessions(all).some((s) => s.date === c.date));
    expect(sharedDays.length).toBeGreaterThan(0);
    const violations = findViolations(
      all,
      { minutesPerDay: [150, 60, 150, 60, 150, 150, 120], doublesAllowed: false },
      'intermediate',
    );
    expect(violations).toEqual([]);
  });

  it('keep hard sessions off heavy commute days when another day fits', () => {
    const heavy: Commute = { ...bikeCommute, oneWayMin: 40, weekdays: [1, 3] };
    const p = plan({
      ...input,
      profile: { ...runner, commutes: [heavy] },
      availability: { minutesPerDay: [60, 150, 60, 150, 60, 120, 90], doublesAllowed: false },
    });
    const all = allWorkouts(p);
    const heavyDays = new Set(commutes(all).map((c) => c.date));
    expect(heavyDays.size).toBeGreaterThan(0);
    expect(sessions(all).filter((w) => w.hard && heavyDays.has(w.date))).toEqual([]);
  });

  it('may still carry a hard session when no other day fits', () => {
    const everyDay: Commute = { ...bikeCommute, oneWayMin: 30, weekdays: [0, 1, 2, 3, 4, 5, 6] };
    const p = plan({
      ...input,
      profile: { ...runner, commutes: [everyDay] },
      availability: { minutesPerDay: [150, 150, 150, 150, 150, 150, 150], doublesAllowed: false },
    });
    expect(allWorkouts(p).some((w) => w.hard && w.commuteId === undefined)).toBe(true);
  });

  it('stay in recovery weeks even when only they are left above the load cap', () => {
    const long: Commute = { ...bikeCommute, oneWayMin: 90, weekdays: [0, 1, 2, 3, 4] };
    const p = plan({
      ...input,
      profile: { ...runner, strength: { mode: 'none' }, commutes: [long] },
      availability: { minutesPerDay: [200, 200, 200, 200, 200, 200, 200], doublesAllowed: false },
    });
    for (const w of p.weeks.filter((x) => !x.isPartial)) {
      expect(commutes(w.workouts)).toHaveLength(5);
    }
  });

  it('are validated', () => {
    const issues = (c: Commute[]) => {
      const r = generatePlan({ ...runner, commutes: c }, { kind: 'fitness' }, week, START);
      return r.ok ? [] : r.issues.map((i) => `${i.field}:${i.code}`);
    };
    expect(issues([bikeCommute])).toEqual([]);
    expect(issues([{ ...bikeCommute, oneWayMin: 2 }])).toEqual(['commutes:outOfRange']);
    expect(commutesValid([{ ...bikeCommute, oneWayMin: 500 }])).toBe(false);
    expect(commutesValid([{ ...bikeCommute, oneWayMin: Number.NaN }])).toBe(false);
    expect(commutesValid([{ ...bikeCommute, sport: 'ski' as Sport as 'bike' }])).toBe(false);
    expect(commutesValid([{ ...bikeCommute, weekdays: [] }])).toBe(false);
    expect(commutesValid([{ ...bikeCommute, weekdays: [1, 1] }])).toBe(false);
    expect(commutesValid([{ ...bikeCommute, weekdays: [7 as 0] }])).toBe(false);
    expect(commutesValid([bikeCommute, bikeCommute])).toBe(false);
  });

  it('can be skipped for a day with one tap (skipped = no load, no rule)', () => {
    const state = newPlanState(plan(input));
    const c = commutes(allWorkouts(state.plan))[0] as Workout;
    const next = ok(setWorkoutStatus(state, c.id, 'skipped'));
    expect(activeWorkouts(next).some((w) => w.id === c.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------

describe('irregular weeks ("This week is different")', () => {
  const input: PlanInput = {
    profile: runner,
    goal: { kind: 'half' },
    availability: week,
    targetDate: '2027-02-14',
  };
  const TODAY = '2026-10-21'; // Wednesday of week 1
  const NEXT = '2026-10-26';
  const base = (): PlanState => newPlanState(plan(input));

  it('rebuilds only that week: days away stay empty, other weeks are untouched', () => {
    const state = base();
    const r = ok(
      setWeekOverride(
        state,
        input,
        NEXT,
        { blockedDates: ['2026-10-26', '2026-10-27', '2026-10-28'] },
        TODAY,
      ),
    );
    expect(weekOverrideOf(r.input, NEXT)?.blockedDates).toHaveLength(3);
    const w = weekAt(r.state.plan, NEXT);
    expect(w.workouts.some((x) => x.date <= '2026-10-28')).toBe(false);
    expect(w.notes).toContainEqual({ key: 'notes.weekOverride' });
    for (const other of r.state.plan.weeks.filter((x) => x.startDate !== NEXT)) {
      expect(other).toEqual(state.plan.weeks.find((x) => x.index === other.index));
    }
  });

  it('keeps the load as far as the remaining days allow', () => {
    const state = base();
    const before = weekAt(state.plan, NEXT).load;
    // Same total minutes, packed into four days.
    const r = ok(
      setWeekOverride(state, input, NEXT, { minutesPerDay: [0, 90, 0, 90, 0, 150, 105] }, TODAY),
    );
    const after = weekAt(r.state.plan, NEXT);
    expect(after.targetLoad).toBe(weekAt(state.plan, NEXT).targetLoad);
    // Four days without doubles hold fewer sessions (strength needs two of them).
    expect(after.load).toBeGreaterThan(before * 0.7);
    expect(after.load).toBeLessThanOrEqual(before * 1.1);
  });

  it('keeps every spacing rule, also towards the following week', () => {
    for (const blocked of [
      ['2026-10-26', '2026-10-27'],
      ['2026-10-31', '2026-11-01'],
      ['2026-10-28', '2026-10-29', '2026-10-30'],
    ]) {
      for (const minutesPerDay of [
        undefined,
        [30, 120, 30, 120, 30, 180, 120] as const,
        [0, 0, 60, 0, 60, 150, 150] as const,
      ]) {
        const override = { blockedDates: blocked, ...(minutesPerDay ? { minutesPerDay } : {}) };
        const r = ok(setWeekOverride(base(), input, NEXT, override, TODAY));
        const violations = findViolations(
          activeWorkouts(r.state),
          r.input.availability,
          runner.experience,
        ).filter((v) => SPACING.includes(v.code));
        expect(violations).toEqual([]);
        // The override's own availability holds as well.
        expect(
          findViolations(activeWorkouts(r.state), r.input.availability, 'intermediate').filter(
            (v) => v.code === 'overAvailability',
          ),
        ).toEqual([]);
      }
    }
  });

  it('respects a hard Monday after the rebuilt week', () => {
    // Monday 2026-11-23 keeps its fartlek; the week before gets its big day on Sunday only.
    const state = base();
    const monday = activeWorkouts(state).filter((w) => w.date === '2026-11-23');
    expect(monday.some((w) => w.hard)).toBe(true);
    const r = ok(
      setWeekOverride(
        state,
        input,
        '2026-11-16',
        { minutesPerDay: [60, 60, 60, 60, 60, 60, 150] },
        TODAY,
      ),
    );
    const sunday = activeWorkouts(r.state).filter((w) => w.date === '2026-11-22');
    expect(sunday.length).toBeGreaterThan(0);
    expect(sunday.some((w) => w.hard)).toBe(false);
  });

  it('reset week removes the override and rebuilds the normal week', () => {
    const state = base();
    const changed = ok(
      setWeekOverride(state, input, NEXT, { minutesPerDay: [0, 0, 0, 0, 0, 60, 60] }, TODAY),
    );
    const reset = ok(setWeekOverride(changed.state, changed.input, NEXT, null, TODAY));
    expect(weekOverrideOf(reset.input, NEXT)).toBeNull();
    expect(reset.input.availability.weekOverrides).toEqual([]);
    const types = (p: Plan) => weekAt(p, NEXT).workouts.map((w) => `${w.date} ${w.templateId}`);
    expect(types(reset.state.plan)).toEqual(types(state.plan));
  });

  it('the current week is rebuilt from today on only', () => {
    const state = base();
    const r = ok(
      setWeekOverride(state, input, START, { minutesPerDay: [0, 0, 0, 0, 0, 0, 0] }, TODAY),
    );
    const w = weekAt(r.state.plan, START);
    expect(w.workouts.every((x) => x.date < TODAY)).toBe(true);
    expect(w.workouts.length).toBeGreaterThan(0);
  });

  it('a week after the plan has nothing to rebuild; the last week is rebuilt to the end', () => {
    const state = base();
    const last = state.plan.weeks[state.plan.weeks.length - 1] as PlanWeek;
    const r = ok(
      setWeekOverride(
        state,
        input,
        last.startDate,
        { minutesPerDay: [30, 30, 30, 30, 30, 30, 0] },
        TODAY,
      ),
    );
    expect(weekAt(r.state.plan, last.startDate).notes).toContainEqual({
      key: 'notes.weekOverride',
    });
  });

  it('refuses invalid weeks and running pauses', () => {
    const state = base();
    const set = (weekStart: string, today = TODAY, s: PlanState = state) =>
      code(setWeekOverride(s, input, weekStart, { blockedDates: [] }, today));
    expect(set('2026-10-27')).toBe('invalidDate'); // a Tuesday
    expect(set('nope')).toBe('invalidDate');
    expect(set('2026-10-12')).toBe('outsidePlan');
    expect(set('2027-03-01')).toBe('outsidePlan');
    expect(set(START, '2026-11-02')).toBe('invalidDate'); // already over
    const paused = ok(pausePlan(state, 'illness', TODAY, TODAY));
    expect(set(NEXT, TODAY, paused)).toBe('paused');
  });

  it('the rule check uses the override availability (days away have none)', () => {
    const w = allWorkouts(plan(input)).find((x) => x.date === '2026-10-26') as Workout;
    const availability: Availability = {
      ...week,
      weekOverrides: [{ weekStart: NEXT, blockedDates: ['2026-10-26'] }],
    };
    expect(findViolations([w], availability, 'intermediate').map((v) => v.code)).toEqual([
      'overAvailability',
    ]);
    expect(findViolations([w], week, 'intermediate')).toEqual([]);
  });

  it('a rebuild that cannot be generated is refused with the engine issue', () => {
    const broken: PlanInput = {
      ...input,
      profile: { ...runner, commutes: [{ ...bikeCommute, oneWayMin: 1 }] },
    };
    expect(code(setWeekOverride(base(), broken, NEXT, { blockedDates: [] }, TODAY))).toBe(
      'outOfRange',
    );
  });

  it('generatePlan validates overrides', () => {
    const issues = (availability: Availability) => {
      const r = generatePlan(runner, { kind: 'fitness' }, availability, START);
      return r.ok ? [] : r.issues.map((i) => `${i.field}:${i.code}`);
    };
    const bad = ['weekOverrides:invalidDate'];
    expect(issues({ ...week, weekOverrides: [{ weekStart: '2026-10-27' }] })).toEqual(bad);
    expect(issues({ ...week, weekOverrides: [{ weekStart: 'x' }] })).toEqual(bad);
    expect(issues({ ...week, weekOverrides: [{ weekStart: NEXT }, { weekStart: NEXT }] })).toEqual(
      bad,
    );
    expect(
      issues({
        ...week,
        weekOverrides: [{ weekStart: NEXT, minutesPerDay: [0, 0, 0, 0, 0, 0, 999] }],
      }),
    ).toEqual(bad);
    expect(
      issues({
        ...week,
        weekOverrides: [
          { weekStart: NEXT, minutesPerDay: [0, 0, 0] as unknown as Availability['minutesPerDay'] },
        ],
      }),
    ).toEqual(bad);
    expect(issues({ ...week, weekOverrides: [{ weekStart: NEXT, blockedDates: ['x'] }] })).toEqual(
      bad,
    );
    expect(issues({ ...week, weekOverrides: [{ weekStart: NEXT, blockedDates: [NEXT] }] })).toEqual(
      [],
    );
  });

  it('irregular weeks are no reference for the +10 % rule of the weeks after', () => {
    const state = base();
    const low = ok(
      setWeekOverride(state, input, NEXT, { minutesPerDay: [0, 30, 0, 30, 0, 45, 0] }, TODAY),
    );
    // Regenerating later weeks still progresses from the last normal week.
    const generated = plan({
      ...input,
      availability: { ...week, weekOverrides: low.input.availability.weekOverrides ?? [] },
    });
    const after = weekAt(generated, '2026-11-02');
    expect(after.load).toBeGreaterThan(weekAt(generated, NEXT).load * 1.1);
  });
});

// ---------------------------------------------------------------------------------------------

describe('travel mode', () => {
  const triInput: PlanInput = {
    profile: {
      age: 40,
      experience: 'intermediate',
      sports: ['swim', 'bike', 'run'],
      terrain: 'hilly',
      strength: { mode: 'peakr', equipment: 'gym' },
      commutes: [bikeCommute],
    },
    goal: { kind: 'tri_olympic' },
    availability: { minutesPerDay: [90, 60, 90, 60, 60, 180, 120], doublesAllowed: true },
    targetDate: '2027-06-13',
  };
  const TODAY = '2026-10-21';
  const TRIP = { startDate: '2026-11-02', endDate: '2026-11-08' };
  const tripDays = (p: Plan) =>
    allWorkouts(p).filter((w) => w.date >= TRIP.startDate && w.date <= TRIP.endDate);

  it('hotel strength, time-based runs, bike/swim alternatives, no commutes', () => {
    const state = newPlanState(plan(triInput));
    const r = ok(setTravel(state, triInput, [TRIP], TODAY));
    expect(activeTravel(r.input, TODAY)).toEqual(TRIP);
    const days = tripDays(r.state.plan);
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((w) => w.travel === true)).toBe(true);
    expect(commutes(days)).toEqual([]);
    expect(days.some((w) => w.sport === 'bike' || w.sport === 'swim' || w.sport === 'brick')).toBe(
      false,
    );
    for (const w of days.filter((x) => x.sport === 'run')) {
      expect(w.terrain).toBeNull();
      const steps = [...w.warmup, ...w.main.flatMap((b) => b.steps), ...w.cooldown];
      expect(steps.every((s) => s.distanceM === undefined)).toBe(true);
    }
    expect(days.some((w) => w.notes.some((n) => n.key === 'notes.travelReplaced'))).toBe(true);
    expect(weekAt(r.state.plan, TRIP.startDate).notes).toContainEqual({ key: 'notes.travelWeek' });
    // Weeks outside the trip stay.
    expect(weekAt(r.state.plan, '2026-11-16')).toEqual(weekAt(state.plan, '2026-11-16'));
  });

  it('replacements are never longer than the original session and never hard', () => {
    const state = newPlanState(plan(triInput));
    const r = ok(setTravel(state, triInput, [TRIP], TODAY));
    const original = tripDays(state.plan);
    for (const w of tripDays(r.state.plan).filter((x) =>
      x.notes.some((n) => n.key === 'notes.travelReplaced'),
    )) {
      const from = original.find(
        (o) =>
          o.date === w.date &&
          o.commuteId === undefined &&
          o.sport !== 'run' &&
          o.sport !== 'strength',
      );
      expect(w.hard).toBe(false);
      expect(w.durationMin).toBeLessThanOrEqual(from?.durationMin ?? Infinity);
    }
  });

  it('keeps rides and swims when a bike and a pool are available', () => {
    const state = newPlanState(plan(triInput));
    const trip = { ...TRIP, bikeAvailable: true, poolAvailable: true };
    const r = ok(setTravel(state, triInput, [trip], TODAY));
    const sports = new Set(tripDays(r.state.plan).map((w) => w.sport));
    expect(sports.has('swim') || sports.has('bike') || sports.has('brick')).toBe(true);
  });

  it('drops a session without any alternative (cyclist without bike)', () => {
    const input: PlanInput = {
      profile: { ...runner, sports: ['bike'], strength: { mode: 'none' } },
      goal: { kind: 'granfondo' },
      availability: week,
      targetDate: '2027-06-13',
    };
    const state = newPlanState(plan(input));
    const r = ok(setTravel(state, input, [TRIP], TODAY));
    expect(tripDays(r.state.plan)).toEqual([]);
    expect(weekAt(r.state.plan, TRIP.startDate).notes).toContainEqual(
      expect.objectContaining({ key: 'notes.travelDropped' }),
    );
  });

  it('travel mode contains no gym exercises – every strength setup', () => {
    const setups: UserProfile['strength'][] = [
      { mode: 'peakr', equipment: 'gym' },
      { mode: 'split', split: 'pushPullLegs', daysPerWeek: 3, equipment: 'gym' },
      { mode: 'split', split: 'upperLower', equipment: 'gym', priority: 'strengthFirst' },
      {
        mode: 'routines',
        routines: [
          {
            id: 'r',
            name: 'Barbell day',
            durationMin: 50,
            exercises: [
              { exerciseId: 'back_squat', sets: 4, reps: '5' },
              { exerciseId: 'bench_press', sets: 4, reps: '6' },
            ],
          },
        ],
      },
    ];
    const hotel = equipmentFor('hotel');
    for (const strength of setups) {
      const input: PlanInput = {
        profile: { ...runner, strength },
        goal: { kind: 'half' },
        availability: week,
        targetDate: '2027-02-14',
      };
      // Trip over a taper week too (core & mobility fallback).
      const trips = [TRIP, { startDate: '2027-02-08', endDate: '2027-02-13' }];
      const r = ok(setTravel(newPlanState(plan(input)), input, trips, TODAY));
      const strengthDays = allWorkouts(r.state.plan).filter(
        (w) => w.travel === true && w.sport === 'strength',
      );
      expect(strengthDays.length).toBeGreaterThan(0);
      for (const w of strengthDays) {
        expect(w.notes).toContainEqual({ key: 'notes.travelStrength' });
        for (const e of w.exercises ?? []) {
          const exercise = getExercise(e.exerciseId);
          expect(exercise && hasEquipmentFor(exercise, hotel), e.exerciseId).toBe(true);
        }
      }
    }
  });

  it('turning travel off rebuilds the normal weeks; unchanged travel rebuilds nothing', () => {
    const state = newPlanState(plan(triInput));
    const on = ok(setTravel(state, triInput, [TRIP], TODAY));
    const same = ok(setTravel(on.state, on.input, [TRIP], TODAY));
    expect(same.state).toBe(on.state);
    const off = ok(setTravel(on.state, on.input, [], TODAY));
    expect(activeTravel(off.input, TODAY)).toBeNull();
    expect(tripDays(off.state.plan).some((w) => w.travel)).toBe(false);
    expect(tripDays(off.state.plan).map((w) => w.templateId)).toEqual(
      tripDays(state.plan).map((w) => w.templateId),
    );
  });

  it('several trips at once; rides replace swims for non-runners with a bike', () => {
    const input: PlanInput = {
      profile: { ...runner, sports: ['swim', 'bike'], strength: { mode: 'none' } },
      goal: { kind: 'fitness' },
      availability: { minutesPerDay: [60, 60, 60, 60, 60, 120, 90], doublesAllowed: false },
    };
    const state = newPlanState(plan(input));
    expect(activeTravel(input, TODAY)).toBeNull();
    const trips = [
      { startDate: '2026-11-16', endDate: '2026-11-22', bikeAvailable: true },
      { ...TRIP, bikeAvailable: true },
    ];
    const r = ok(setTravel(state, input, trips, TODAY));
    expect(activeTravel(r.input, TODAY)).toEqual(trips[1]);
    const days = allWorkouts(r.state.plan).filter((w) => w.travel);
    expect(days.some((w) => w.sport === 'swim')).toBe(false);
    expect(
      days.some(
        (w) =>
          w.sport === 'bike' &&
          w.notes.some((n) => n.key === 'notes.travelReplaced' && n.params?.sport === 'bike'),
      ),
    ).toBe(true);
  });

  it('a trip that is already over changes the input but no workout', () => {
    const state = newPlanState(plan(triInput));
    const r = ok(setTravel(state, triInput, [TRIP], '2026-11-20'));
    expect(r.state).toBe(state);
    expect(activeTravel(r.input, '2026-11-20')).toBeNull();
  });

  it('validates dates', () => {
    const state = newPlanState(plan(triInput));
    expect(
      code(setTravel(state, triInput, [{ startDate: 'x', endDate: TRIP.endDate }], TODAY)),
    ).toBe('invalidDate');
    expect(
      code(
        setTravel(state, triInput, [{ startDate: TRIP.endDate, endDate: TRIP.startDate }], TODAY),
      ),
    ).toBe('invalidDate');
    expect(
      code(setTravel(state, triInput, [{ startDate: TRIP.startDate, endDate: 'y' }], TODAY)),
    ).toBe('invalidDate');
    const r = generatePlan(
      triInput.profile,
      triInput.goal,
      { ...triInput.availability, travel: [{ startDate: '2026-11-08', endDate: '2026-11-02' }] },
      START,
    );
    expect(r.ok ? [] : r.issues.map((i) => `${i.field}:${i.code}`)).toEqual(['travel:invalidDate']);
  });

  it('helpers', () => {
    expect(travelOn(undefined, '2026-11-03')).toBeNull();
    expect(travelOn([TRIP], '2026-11-03')).toEqual(TRIP);
    expect(travelOn([TRIP], '2026-11-09')).toBeNull();
    const step = {
      durationSec: 60,
      distanceM: 200,
      zone: 5 as const,
      target: { kind: 'paceZone' as const, value: 'I' },
    };
    expect(timeBased([step])).toEqual([{ durationSec: 60, zone: 5, target: step.target }]);
    expect(replacementSport('swim', TRIP, ['swim', 'bike'], [])).toBeNull();
    expect(replacementSport('swim', { ...TRIP, bikeAvailable: true }, ['swim', 'bike'], [])).toBe(
      'bike',
    );
    expect(replacementSport('bike', TRIP, ['run', 'bike'], ['run'])).toBeNull();
    expect(replacementSport('brick', { ...TRIP, bikeAvailable: true }, ['run'], [])).toBe('brick');
    expect(replacementSport('bike', { ...TRIP, poolAvailable: true }, ['bike', 'swim'], [])).toBe(
      'swim',
    );
  });
});

// ---------------------------------------------------------------------------------------------

describe('winter variants have equivalent load', () => {
  it('every variant is within the load tolerance – sports, roles and loads', () => {
    const sets: WinterSport[][] = [['xcski'], ['snowshoe'], ['skitour'], ['skitour', 'xcski']];
    const roles: SlotRole[] = ['easy', 'long', 'key', 'quality'];
    let found = 0;
    for (const winterSports of sets) {
      const athlete = athleteFor({ ...runner, winterSports }, 'fitness');
      for (const role of roles) {
        for (let load = 40; load <= 600; load += 7) {
          for (const sport of ['run', 'bike'] as const) {
            const v = winterVariantFor({ sport, role, load }, athlete, 1, false);
            if (!v) continue;
            found++;
            expect(Math.abs(v.load - load)).toBeLessThanOrEqual(load * 0.1);
          }
        }
      }
    }
    expect(found).toBeGreaterThan(200);
  });

  it('falls back to the next winter sport when the first cannot match the load', () => {
    // 60 load ≈ 35 min ski touring – below its 60 min minimum; XC skiing (≥ 45 min) fits better.
    const athlete = athleteFor({ ...runner, winterSports: ['skitour', 'xcski'] }, 'fitness');
    expect(
      winterVariantFor({ sport: 'run', role: 'easy', load: 75 }, athlete, 1, false)?.sport,
    ).toBe('xcski');
    expect(
      winterVariantFor({ sport: 'run', role: 'easy', load: 20 }, athlete, 1, false),
    ).toBeNull();
  });

  it('race goals keep key sessions in the target sport over the whole winter', () => {
    const p = plan({
      profile: { ...runner, winterSports: ['xcski'] },
      goal: { kind: 'half' },
      availability: week,
      targetDate: '2027-02-14',
    });
    const winter = allWorkouts(p).filter((w) => w.date >= '2026-12-01');
    expect(
      winter
        .filter((w) => w.role === 'key' || w.role === 'quality')
        .every((w) => w.winterVariant === null),
    ).toBe(true);
    expect(winter.some((w) => w.winterVariant !== null)).toBe(true);
  });
});
