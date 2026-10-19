import { describe, expect, it } from 'vitest';

import {
  activeWorkouts,
  allWorkouts,
  easeWorkout,
  findViolations,
  findWorkout,
  inDetailWindow,
  isPaused,
  moveWorkout,
  newPlanState,
  pausePlan,
  planRange,
  regeneratePlan,
  regenerationStart,
  resumePlan,
  resumeRules,
  setWorkoutStatus,
  type PlanInput,
  type PlanState,
} from './edit';
import { grid } from './fixtures';
import { generatePlan } from './generate';
import type { Plan, PlanWeek, Workout } from './types';

/**
 * Plan editing (CLAUDE.md "Editing", "Pause"). The base plan: intermediate runner, half marathon
 * on 2027-02-14, plan from Monday 2026-10-19. Week 2 (index 1) looks like this:
 *   Mon 10-26 easy 50' · Tue 10-27 strength (heavy legs) · Wed 10-28 easy 45'
 *   Thu 10-29 strength (heavy legs) · Fri rest (0 min available) · Sat 10-31 long · Sun 11-01 fartlek
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

function basePlan(): Plan {
  const r = generatePlan(input.profile, input.goal, input.availability, START, input.targetDate);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

function ok<T>(r: { ok: true; value: T } | { ok: false; issues: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

function code(r: { ok: true } | { ok: false; issues: { code: string }[] }): string | null {
  return r.ok ? null : (r.issues[0]?.code ?? null);
}

const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekOf = (plan: Plan, date: string): PlanWeek =>
  plan.weeks.find((w) => w.startDate <= date && date < addDays(w.startDate, 7)) as PlanWeek;
const totalLoad = (plan: Plan) => plan.weeks.reduce((sum, w) => sum + w.load, 0);

describe('rule check', () => {
  it('finds no broken rule in any generated plan', () => {
    for (const c of grid()) {
      const r = generatePlan(c.profile, { kind: c.goal }, c.availability, c.start, c.target);
      if (!r.ok) continue;
      const v = findViolations(allWorkouts(r.value), c.availability, c.profile.experience);
      expect(v, c.name).toEqual([]);
    }
  });
});

describe('moveWorkout', () => {
  const state = newPlanState(basePlan());

  it('the base week matches the documented layout', () => {
    const week = weekOf(state.plan, '2026-10-26');
    expect(week.workouts.map((w) => `${w.date} ${w.templateType}`)).toEqual([
      '2026-10-26 easy',
      '2026-10-27 peakr_base_gym',
      '2026-10-28 easy',
      '2026-10-29 peakr_base_gym',
      '2026-10-31 long',
      '2026-11-01 fartlek',
    ]);
  });

  it('moves to a free day and keeps the weekly load', () => {
    const before = weekOf(state.plan, '2026-10-26');
    const r = ok(moveWorkout(state, '2026-10-28-1', '2026-10-30', input, START));
    const after = weekOf(r.state.plan, '2026-10-26');
    const moved = findWorkout(r.state.plan, '2026-10-28-1');
    expect(moved?.date).toBe('2026-10-30');
    expect(moved?.weekday).toBe(4);
    expect(after.load).toBeCloseTo(before.load, 5);
    const dates = after.workouts.map((w) => w.date);
    expect(dates).toEqual([...dates].sort());
    expect(r.suggestion).toBeNull();
    // Friday has no available minutes: allowed, but the user is told.
    expect(r.warnings.map((w) => w.code)).toEqual(['overAvailability']);
  });

  it('a taken day: the move stays as the user made it, a swap is only suggested', () => {
    const r = ok(moveWorkout(state, '2026-10-28-1', '2026-10-27', input, START));
    // Exactly the user's move: both sessions on Tuesday.
    expect(findWorkout(r.state.plan, '2026-10-27-1')?.date).toBe('2026-10-27');
    expect(findWorkout(r.state.plan, '2026-10-28-1')?.date).toBe('2026-10-27');
    expect(r.warnings.map((w) => w.code)).toContain('tooManySessions');
    expect(r.suggestion?.moves).toEqual([
      { id: '2026-10-27-1', from: '2026-10-27', to: '2026-10-28' },
    ]);
    const applied = r.suggestion?.state as PlanState;
    expect(findWorkout(applied.plan, '2026-10-27-1')?.date).toBe('2026-10-28');
    const left = findViolations(activeWorkouts(applied), input.availability, 'intermediate');
    expect(left.map((v) => v.code)).not.toContain('tooManySessions');
    expect(weekOf(applied.plan, '2026-10-26').load).toBeCloseTo(
      weekOf(state.plan, '2026-10-26').load,
      5,
    );
  });

  it('warns about two hard days in a row and offers to make the other day easier', () => {
    // Strength (heavy legs) to Monday – right after last Sunday's fartlek.
    const r = ok(moveWorkout(state, '2026-10-27-1', '2026-10-26', input, START));
    const warning = r.warnings.find((w) => w.code === 'backToBackHard');
    expect(warning?.dates).toEqual(['2026-10-25', '2026-10-26']);
    expect(warning?.easeable).toEqual(['2026-10-25-1']);

    const eased = ok(easeWorkout(r.state, '2026-10-25-1', input));
    const w = findWorkout(eased.plan, '2026-10-25-1');
    expect(w).toMatchObject({
      templateType: 'easy',
      type: 'easy',
      intensity: 'easy',
      hard: false,
      level: null,
    });
    expect(w?.durationMin).toBe(findWorkout(state.plan, '2026-10-25-1')?.durationMin);
    expect(w?.notes.map((n) => n.key)).toContain('notes.eased');
    const left = findViolations(activeWorkouts(eased), input.availability, 'intermediate');
    expect(left.filter((v) => v.code === 'backToBackHard')).toEqual([]);
  });

  it('keeping it anyway leaves the plan as moved', () => {
    const r = ok(moveWorkout(state, '2026-10-27-1', '2026-10-26', input, START));
    expect(findWorkout(r.state.plan, '2026-10-27-1')?.date).toBe('2026-10-26');
    expect(findWorkout(r.state.plan, '2026-10-25-1')?.hard).toBe(true);
  });

  it('skipped sessions do not count for the rules', () => {
    const skipped = ok(setWorkoutStatus(state, '2026-10-25-1', 'skipped'));
    const r = ok(moveWorkout(skipped, '2026-10-27-1', '2026-10-26', input, START));
    expect(r.warnings.filter((w) => w.code === 'backToBackHard')).toEqual([]);
  });

  it('moves across weeks and recomputes both weeks', () => {
    const w = findWorkout(state.plan, '2026-11-01-1');
    const r = ok(moveWorkout(state, '2026-11-01-1', '2026-11-02', input, START));
    expect(weekOf(r.state.plan, '2026-10-26').load).toBeCloseTo(
      weekOf(state.plan, '2026-10-26').load - (w?.load ?? 0),
      5,
    );
    expect(totalLoad(r.state.plan)).toBeCloseTo(totalLoad(state.plan), 5);
  });

  it('allows done, past and paused moves – with a hint – but not outside the plan', () => {
    const done = ok(setWorkoutStatus(state, '2026-10-19-1', 'done'));
    const codes = (s: PlanState, id: string, to: string, today = START) =>
      ok(moveWorkout(s, id, to, input, today)).warnings.map((w) => w.code);
    expect(codes(done, '2026-10-19-1', '2026-10-20')).not.toContain('pastDay');
    // A past workout onto another past day (e.g. logged a day late).
    expect(codes(state, '2026-10-26-1', '2026-10-24', '2026-10-27')).toContain('pastDay');
    const paused = ok(pausePlan(state, 'holiday', '2026-10-30', START));
    expect(codes(paused, '2026-10-28-1', '2026-10-31')).toContain('pausedDay');
    expect(code(moveWorkout(state, '2026-10-28-1', '2027-02-14', input, START))).toBe(
      'outsidePlan',
    );
    expect(code(moveWorkout(state, 'nope', '2026-10-27', input, START))).toBe('notFound');
  });
});

describe('easeWorkout', () => {
  it('deloads the heavy leg exercises of a strength session', () => {
    const state = newPlanState(basePlan());
    const before = findWorkout(state.plan, '2026-10-27-1');
    const after = ok(easeWorkout(state, '2026-10-27-1', input));
    const eased = findWorkout(after.plan, '2026-10-27-1');
    expect(before?.legLoad).toBe('heavy');
    expect(eased).toMatchObject({ legLoad: 'light', hard: false, intensity: 'easy' });
    expect(eased?.load).toBeLessThan(before?.load ?? 0);
  });
});

describe('setWorkoutStatus', () => {
  const state = newPlanState(basePlan());

  it('marks done (any day), skipped and back to planned', () => {
    const done = ok(setWorkoutStatus(state, '2026-10-19-1', 'done'));
    expect(done.status['2026-10-19-1']).toBe('done');
    expect(ok(setWorkoutStatus(state, '2026-10-26-1', 'done')).status['2026-10-26-1']).toBe('done');
    const skipped = ok(setWorkoutStatus(state, '2026-10-26-1', 'skipped'));
    expect(skipped.status['2026-10-26-1']).toBe('skipped');
    const planned = ok(setWorkoutStatus(skipped, '2026-10-26-1', 'planned'));
    expect(planned.status).toEqual({});
  });
});

describe('pause and resume', () => {
  const state = newPlanState(basePlan());
  // Week index 2 (2026-11-02) is the last full loading week before both pauses (index 3 recovers).
  const reference = weekOf(state.plan, '2026-11-02').load;

  function pauseAndResume(from: string, resume: string) {
    const paused = ok(pausePlan(state, 'illness', from, from));
    return ok(resumePlan(paused, resume, input, resume));
  }

  it('maps the pause length to the resume rules', () => {
    expect(resumeRules(7)).toEqual({ factor: 0.8, restartPhases: false });
    expect(resumeRules(14)).toEqual({ factor: 0.7, restartPhases: false });
    expect(resumeRules(15)).toEqual({ factor: 0.6, restartPhases: true });
  });

  it.each([
    ['2026-11-18', 0.8],
    ['2026-11-13', 0.7],
  ])('pause from %s: first week at %d of the last loading week', (from, factor) => {
    const resumed = pauseAndResume(from, '2026-11-23');
    const week = weekOf(resumed.plan, '2026-11-23');
    expect(week.targetLoad).toBe(Math.round(reference * factor));
    expect(week.load).toBeLessThanOrEqual(reference * factor + 0.5);
    expect(week.load).toBeGreaterThan(reference * factor * 0.8);
    // Short pauses keep the phases.
    expect(resumed.plan.weeks.map((w) => w.phase)).toEqual(state.plan.weeks.map((w) => w.phase));
  });

  it('a long pause resumes at 60 % and re-enters Base', () => {
    const resumed = pauseAndResume('2026-11-02', '2026-11-23');
    // The last full loading week before this pause is week index 1.
    const before = weekOf(state.plan, '2026-10-26').load;
    expect(weekOf(resumed.plan, '2026-11-23').targetLoad).toBe(Math.round(before * 0.6));
    expect(state.plan.weeks[7]?.phase).toBe('build');
    expect(resumed.plan.weeks[7]?.phase).toBe('base');
    expect(resumed.plan.weeks.at(-1)?.phase).toBe('taper');
  });

  it('removes planned sessions inside the pause, keeps done ones and lowers levels', () => {
    const doneState = ok(setWorkoutStatus(state, '2026-11-02-1', 'done'));
    const paused = ok(pausePlan(doneState, 'injury', '2026-11-03', '2026-11-03'));
    const resumed = ok(resumePlan(paused, '2026-11-12', input, '2026-11-12'));
    const inPause = allWorkouts(resumed.plan).filter(
      (w) => w.date >= '2026-11-03' && w.date < '2026-11-12',
    );
    expect(inPause).toEqual([]);
    expect(findWorkout(resumed.plan, '2026-11-02-1')).toBeDefined();
    expect(resumed.status['2026-11-02-1']).toBe('done');
    expect(resumed.pauses).toEqual([
      { reason: 'injury', startDate: '2026-11-03', endDate: '2026-11-12' },
    ]);
    const fresh = allWorkouts(resumed.plan).filter((w) => w.date >= '2026-11-12');
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((w) => w.id.startsWith('r1-'))).toBe(true);
    const level = (p: Plan, type: string, from: string) =>
      allWorkouts(p).find((w) => w.templateType === type && w.date >= from)?.level ?? 0;
    expect(level(resumed.plan, 'fartlek', '2026-11-12')).toBeLessThan(
      level(state.plan, 'fartlek', '2026-11-12'),
    );
  });

  it('rejects a second pause, resuming without a pause and dates in the past', () => {
    const paused = ok(pausePlan(state, 'holiday', '2026-11-02', '2026-11-01'));
    expect(code(pausePlan(paused, 'holiday', '2026-11-05', '2026-11-01'))).toBe('paused');
    expect(code(resumePlan(state, '2026-11-05', input, '2026-11-05'))).toBe('notPaused');
    expect(code(resumePlan(paused, '2026-11-01', input, '2026-11-01'))).toBe('invalidDate');
    expect(code(pausePlan(state, 'holiday', '2026-10-01', '2026-10-19'))).toBe('invalidDate');
    expect(code(regeneratePlan(paused, input, '2026-11-03'))).toBe('paused');
  });
});

describe('regeneratePlan', () => {
  const today = '2026-11-04';
  const availability: PlanInput['availability'] = {
    minutesPerDay: [0, 60, 60, 0, 60, 120, 0],
    doublesAllowed: false,
  };
  let state = newPlanState(basePlan());
  state = ok(setWorkoutStatus(state, '2026-11-02-1', 'done'));
  state = ok(setWorkoutStatus(state, '2026-11-03-1', 'skipped'));
  const regenerated = ok(regeneratePlan(state, { ...input, availability }, today));

  it('keeps everything before today and the completed workouts', () => {
    const before = (p: Plan) => allWorkouts(p).filter((w) => w.date < today);
    expect(before(regenerated.plan)).toEqual(before(state.plan));
    expect(regenerated.status).toEqual({ '2026-11-02-1': 'done', '2026-11-03-1': 'skipped' });
  });

  it('the remaining weeks follow the new availability and the rules', () => {
    const rest = allWorkouts(regenerated.plan).filter((w) => w.date >= today);
    expect(rest.length).toBeGreaterThan(20);
    expect(rest.every((w) => availability.minutesPerDay[w.weekday] > 0)).toBe(true);
    expect(rest.every((w) => w.id.startsWith('r1-'))).toBe(true);
    expect(findViolations(rest, availability, 'intermediate')).toEqual([]);
    expect(regenerated.plan.weeks.map((w) => w.phase)).toEqual(
      state.plan.weeks.map((w) => w.phase),
    );
  });

  it('progression continues: the first full new week stays within +10 % of the reference', () => {
    const reference = weekOf(state.plan, '2026-10-26').load;
    expect(weekOf(regenerated.plan, '2026-11-09').load).toBeLessThanOrEqual(reference * 1.1);
  });

  it('starts tomorrow when a session was done today', () => {
    const doneToday = ok(setWorkoutStatus(state, '2026-11-04-1', 'done'));
    expect(regenerationStart(doneToday, today)).toBe('2026-11-05');
    expect(regenerationStart(state, today)).toBe(today);
  });
});

describe('inDetailWindow', () => {
  it('shows details for the current week and the next 3', () => {
    expect(inDetailWindow('2026-11-15', '2026-10-21')).toBe(true);
    expect(inDetailWindow('2026-11-16', '2026-10-21')).toBe(false);
  });
});

describe('edge cases', () => {
  const state = newPlanState(basePlan());

  it('findViolations: two hard sessions on one day and heavy legs after a long descent', () => {
    const base = findWorkout(state.plan, '2026-11-01-1') as Workout;
    const strength = findWorkout(state.plan, '2026-10-27-1') as Workout;
    const hardRun = { ...base, id: 'a', date: '2026-11-03' };
    const hardBike = { ...base, id: 'b', sport: 'bike' as const, date: '2026-11-03' };
    const descent = {
      ...base,
      id: 'c',
      date: '2026-11-05',
      intensity: 'easy' as const,
      templateType: 'easy',
      terrain: { gainPerKm: 30, distanceKm: 12, expectedGainM: 360, eccentric: true },
    };
    const legs = { ...strength, id: 'd', date: '2026-11-06' };
    const doubles = { ...input.availability, doublesAllowed: true };
    const codes = findViolations([hardRun, hardBike, descent, legs], doubles, 'advanced').map(
      (v) => v.code,
    );
    expect(codes).toContain('twoHardOneDay');
    expect(codes).toContain('heavyLegsAfterDescent');
    expect(codes).not.toContain('tooManySessions');
  });

  it('planRange: open-ended plans run to the last Sunday, dated ones to the target', () => {
    const open = generatePlan(input.profile, { kind: 'fitness' }, input.availability, START);
    const dated = generatePlan(
      input.profile,
      { kind: 'fitness' },
      input.availability,
      START,
      '2027-01-06',
    );
    expect(planRange(ok(open)).last).toBe('2027-01-10');
    expect(planRange(ok(dated)).last).toBe('2027-01-06');
    expect(planRange(state.plan)).toEqual({ first: START, last: '2027-02-13' });
  });

  it('rejects bad input', () => {
    expect(code(moveWorkout(state, '2026-10-26-1', 'not-a-date', input, START))).toBe(
      'invalidDate',
    );
    expect(code(easeWorkout(state, 'nope', input))).toBe('notFound');
    expect(code(setWorkoutStatus(state, 'nope', 'done'))).toBe('notFound');
    const paused = ok(pausePlan(state, 'illness', '2026-10-26', START));
    expect(ok(setWorkoutStatus(paused, '2026-10-27-1', 'skipped')).status).toEqual({
      '2026-10-27-1': 'skipped',
    });
    expect(code(pausePlan(state, 'holiday', '2027-03-01', START))).toBe('outsidePlan');
    const noDays = { minutesPerDay: [0, 0, 0, 0, 0, 0, 0], doublesAllowed: false } as const;
    expect(code(regeneratePlan(state, { ...input, availability: noDays }, START))).toBe(
      'notEnoughAvailability',
    );
  });

  it('eases a long session into an easy long one', () => {
    const eased = findWorkout(ok(easeWorkout(state, '2026-10-31-1', input)).plan, '2026-10-31-1');
    expect(eased).toMatchObject({ role: 'long', templateType: 'long', type: 'long', level: null });
  });

  it('eases a hard swim set into an easy swim', () => {
    const tri: PlanInput = {
      ...input,
      profile: { ...input.profile, sports: ['run', 'bike', 'swim'], strength: { mode: 'none' } },
      goal: { kind: 'tri_olympic' },
      availability: { minutesPerDay: [60, 60, 60, 60, 60, 180, 120], doublesAllowed: true },
    };
    const plan = ok(generatePlan(tri.profile, tri.goal, tri.availability, START, tri.targetDate));
    const swim = allWorkouts(plan).find((w) => w.sport === 'swim' && w.hard) as Workout;
    const eased = ok(easeWorkout(newPlanState(plan), swim.id, tri));
    expect(findWorkout(eased.plan, swim.id)).toMatchObject({
      sport: 'swim',
      templateId: 'swim.easy',
      indoorAlternativeId: 'indoor.pool',
      hard: false,
    });
  });

  it('regenerating with the same input from the start reproduces the plan', () => {
    const r = ok(regeneratePlan(state, input, START));
    const strip = (p: Plan) => allWorkouts(p).map((w) => ({ ...w, id: w.id.replace(/^r1-/, '') }));
    expect(strip(r.plan)).toEqual(strip(state.plan));
    expect(r.plan.weeks.map((w) => w.targetLoad)).toEqual(
      state.plan.weeks.map((w) => w.targetLoad),
    );
  });

  it('resuming on the first paused day just ends the pause', () => {
    const paused = ok(pausePlan(state, 'holiday', '2026-11-02', START));
    const resumed = ok(resumePlan(paused, '2026-11-02', input, START));
    expect(resumed.pauses).toEqual([]);
    expect(resumed.plan).toBe(state.plan);
  });

  it('a pause into the race keeps only what came before', () => {
    const paused = ok(pausePlan(state, 'injury', '2027-02-10', '2027-02-10'));
    const resumed = ok(resumePlan(paused, '2027-02-20', input, '2027-02-20'));
    expect(allWorkouts(resumed.plan).every((w) => w.date < '2027-02-10')).toBe(true);
  });

  it('several pauses one after the other', () => {
    let s = ok(pausePlan(state, 'holiday', '2026-11-02', START));
    s = ok(resumePlan(s, '2026-11-05', input, '2026-11-05'));
    s = ok(pausePlan(s, 'illness', '2026-11-20', '2026-11-05'));
    s = ok(resumePlan(s, '2026-11-24', input, '2026-11-24'));
    expect(s.pauses.map((p) => p.endDate)).toEqual(['2026-11-05', '2026-11-24']);
    expect(s.revision).toBe(2);
    expect(isPaused(s, '2026-11-03')).toBe(true);
    expect(isPaused(s, '2026-11-10')).toBe(false);
    expect(new Set(allWorkouts(s.plan).map((w) => w.id)).size).toBe(allWorkouts(s.plan).length);
  });

  it('generatePlan continuation: start after the plan end, resume without a reference', () => {
    const late = generatePlan(
      input.profile,
      { kind: 'fitness' },
      input.availability,
      '2027-06-07',
      undefined,
      {
        planStartDate: START,
        referenceLoad: null,
      },
    );
    expect(code(late)).toBe('invalidDate');
    const resumed = ok(
      generatePlan(input.profile, input.goal, input.availability, START, input.targetDate, {
        planStartDate: START,
        referenceLoad: null,
        firstWeekFactor: 0.5,
      }),
    );
    expect(resumed.weeks[0]?.targetLoad).toBe(
      Math.round((state.plan.weeks[0]?.targetLoad ?? 0) * 0.5),
    );
  });
});
