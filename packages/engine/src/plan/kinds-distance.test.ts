import { describe, expect, it } from 'vitest';

import { workoutDistances, summarizeWorkouts } from './distance';
import { grid } from './fixtures';
import { generatePlan } from './generate';
import { workoutLibrary } from './library';
import { kindKey, WORKOUT_KINDS, workoutKind } from './kinds';
import type { UserProfile, Workout } from './types';

const profile: UserProfile = {
  age: 35,
  experience: 'intermediate',
  sports: ['run', 'bike', 'swim'],
  terrain: 'flat',
  strength: { mode: 'peakr', equipment: 'gym' },
};

function plan(goal: 'half' | 'tri_olympic' = 'tri_olympic', p: UserProfile = profile) {
  const r = generatePlan(
    p,
    { kind: goal },
    { minutesPerDay: [60, 60, 60, 60, 60, 180, 120], doublesAllowed: true },
    '2026-10-19',
    '2027-03-14',
  );
  if (!r.ok) throw new Error('plan');
  return r.value;
}

describe('workout kinds', () => {
  const known = new Set(WORKOUT_KINDS.map(kindKey));

  it('every library template has an explicit kind listed in the overview', () => {
    for (const t of workoutLibrary) {
      const kind = workoutKind({ sport: t.sport, templateId: t.id, role: 'easy' });
      expect(known.has(kindKey(kind)), t.id).toBe(true);
    }
  });

  it('every workout of every grid plan maps to a listed kind', () => {
    for (const c of grid()) {
      const r = generatePlan(c.profile, { kind: c.goal }, c.availability, c.start, c.target);
      if (!r.ok) continue;
      for (const w of r.value.weeks.flatMap((x) => x.workouts)) {
        expect(known.has(kindKey(workoutKind(w))), `${c.name} ${w.templateId}`).toBe(true);
      }
    }
  });

  it('maps examples to their general name', () => {
    const k = (sport: Workout['sport'], templateId: string, role: Workout['role'] = 'easy') =>
      kindKey(workoutKind({ sport, templateId, role }));
    expect(k('run', 'run.easy_strides')).toBe('run.easy');
    expect(k('run', 'run.fartlek')).toBe('run.intervals');
    expect(k('run', 'bench.run_5k', 'benchmark')).toBe('run.test');
    expect(k('swim', 'swim.css')).toBe('swim.threshold');
    expect(k('strength', 'routine:abc', 'strength')).toBe('strength.strength');
    expect(k('brick', 'brick', 'brick')).toBe('brick.brick');
    expect(k('xcski', 'xcski.intervals')).toBe('winter.intervals');
    expect(k('run', 'run.unknown')).toBe('run.easy');
  });
});

describe('distances', () => {
  const workouts = plan().weeks.flatMap((w) => w.workouts);
  const first = (pred: (w: Workout) => boolean) => workouts.find(pred) as Workout;

  it('estimates plausible km per sport; strength has none', () => {
    const run = first((w) => w.templateId === 'run.easy');
    const km = workoutDistances(run, profile).run ?? 0;
    // Intermediate easy pace ≈ 6:34 min/km.
    expect(km).toBeCloseTo(run.durationMin / 6.56, 0);
    const ride = first((w) => w.templateId === 'bike.endurance');
    expect(workoutDistances(ride, profile).bike).toBeCloseTo((ride.durationMin / 60) * 26, 0);
    const swim = first((w) => w.sport === 'swim');
    const swimKm = workoutDistances(swim, profile).swim ?? 0;
    expect(swimKm).toBeGreaterThan(0.5);
    expect(swimKm).toBeLessThan(5);
    expect(
      workoutDistances(
        first((w) => w.sport === 'strength'),
        profile,
      ),
    ).toEqual({});
  });

  it('swim rest is standing rest; steps without time count nothing', () => {
    const swim = first((w) => w.sport === 'swim');
    const target = { kind: 'rpe' as const, value: '2' };
    const rested: Workout = {
      ...swim,
      warmup: [],
      cooldown: [],
      main: [
        {
          repeat: 2,
          steps: [
            { durationSec: 60, zone: 1, target, rest: true },
            { zone: 2, target },
          ],
        },
      ],
    };
    expect(workoutDistances(rested, profile)).toEqual({ swim: 0 });
  });

  it('a brick has bike and run km', () => {
    const brick = first((w) => w.sport === 'brick');
    const d = workoutDistances(brick, profile);
    expect(d.bike).toBeGreaterThan(0);
    expect(d.run).toBeGreaterThan(0);
  });

  it('hard sessions cover more ground per minute than easy ones', () => {
    const easy = first((w) => w.templateId === 'run.easy');
    const hard = first((w) => w.sport === 'run' && w.intensity === 'hard');
    const perMin = (w: Workout) => (workoutDistances(w, profile).run ?? 0) / w.durationMin;
    expect(perMin(hard)).toBeGreaterThan(perMin(easy));
  });

  it('summarizes a week: sessions, km per sport and minutes', () => {
    const runner: UserProfile = { ...profile, sports: ['run'] };
    const week = plan('half', runner).weeks[1]?.workouts ?? [];
    const s = summarizeWorkouts(week, runner);
    expect(s.sessions).toBe(week.length);
    expect(s.minutes).toBe(week.reduce((sum, w) => sum + w.durationMin, 0));
    expect(Object.keys(s.distances)).toEqual(['run']);
    expect(s.distances.run).toBeGreaterThan(15);
  });
});
