import { describe, expect, it } from 'vitest';

import { generatePlan } from './generate';
import {
  exercises,
  getExercise,
  getTemplate,
  hasEquipmentFor,
  nextVariation,
  progressionChains,
  resolveExercise,
  splits,
  validateCustomExercise,
  type CustomExercise,
} from './library';
import { materializeStrength } from './materialize';
import { adaptToEquipment, equipmentFor } from './strength-equipment';
import { prefillExercise, summarizeStrengthLog } from './strength-log';
import { planStrengthWeek } from './strength-plan';
import { defaultRestSec, parseReps } from './strength-reps';
import type {
  Availability,
  Phase,
  SplitId,
  StrengthEquipment,
  StrengthPriority,
  StrengthSetup,
  UserProfile,
  Workout,
} from './types';

/** Strength modes, splits, own routines and logging (WORKOUTS.md §8). */

const runner = (strength: StrengthSetup): UserProfile => ({
  age: 35,
  experience: 'intermediate',
  sports: ['run'],
  terrain: 'flat',
  strength,
});

const FULL_WEEK: Availability = {
  minutesPerDay: [60, 60, 60, 60, 60, 120, 90],
  doublesAllowed: false,
};

function plan(
  strength: StrengthSetup,
  availability = FULL_WEEK,
  goal: 'half' | 'fitness' = 'half',
) {
  const r = generatePlan(
    runner(strength),
    { kind: goal },
    availability,
    '2026-11-02',
    goal === 'half' ? '2027-02-28' : undefined,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

/** Every plan day in order with its workouts. */
function days(p: ReturnType<typeof plan>): Workout[][] {
  return p.weeks.flatMap((w) =>
    [0, 1, 2, 3, 4, 5, 6].map((d) => w.workouts.filter((x) => x.weekday === d)),
  );
}

const isHeavyLegs = (w: Workout) => w.sport === 'strength' && w.legLoad === 'heavy';
const isLongOrKey = (w: Workout) => ['long', 'key', 'brick', 'benchmark'].includes(w.role);

const SPLIT_IDS = Object.keys(splits) as SplitId[];
const PRIORITIES: StrengthPriority[] = ['enduranceFirst', 'balanced', 'strengthFirst'];
const PHASES: Phase[] = ['base', 'build', 'peak', 'taper', 'maintain'];

const legRoutine: StrengthSetup = {
  mode: 'routines',
  routines: [
    {
      id: 'legs',
      name: 'Leg day',
      durationMin: 50,
      exercises: [
        { exerciseId: 'back_squat', sets: 4, reps: '5', weightKg: 100 },
        { exerciseId: 'custom:sled', sets: 3, reps: '20 m' },
      ],
    },
  ],
  customExercises: [
    {
      id: 'custom:sled',
      name: 'Sled push',
      pattern: 'squat',
      primaryMuscles: ['quads'],
      secondaryMuscles: [],
      muscles: ['quads'],
      equipment: ['machine'],
      legLoad: 'heavy',
      unilateral: false,
      trackingMode: 'distance',
    },
  ],
};

const SETUPS: StrengthSetup[] = [
  ...PRIORITIES.flatMap((priority) => [
    { mode: 'peakr' as const, equipment: 'gym' as const, priority },
    { mode: 'split' as const, split: 'pushPullLegs' as const, daysPerWeek: 3, priority },
    { mode: 'split' as const, split: 'upperLower' as const, daysPerWeek: 4, priority },
    { mode: 'split' as const, split: 'glutesLegs' as const, equipment: 'home' as const, priority },
    { ...legRoutine, priority },
  ]),
];

describe('strength scheduling rules (§8.3)', () => {
  const plans = SETUPS.map((s) => ({ setup: s, plan: plan(s) }));

  it('taper weeks never contain heavy legs – in every mode and priority', () => {
    for (const { setup, plan: p } of plans) {
      const taper = p.weeks.filter((w) => w.phase === 'taper');
      expect(taper.length, JSON.stringify(setup)).toBeGreaterThan(0);
      for (const w of taper) expect(w.workouts.filter(isHeavyLegs)).toEqual([]);
    }
  });

  it('heavy legs are never on the day before a long or key session', () => {
    for (const { plan: p } of plans) {
      const all = days(p);
      expect(all.some((d) => d.some(isHeavyLegs))).toBe(true);
      all.forEach((day, i) => {
        if (day.some(isHeavyLegs)) expect((all[i + 1] ?? []).some(isLongOrKey)).toBe(false);
      });
    }
  });

  it('push and pull days may sit right next to quality and long runs', () => {
    const all = days(
      plan({ mode: 'split', split: 'pushPullLegs', daysPerWeek: 3, equipment: 'gym' }),
    );
    const upper = (w: Workout) => w.templateType === 'push' || w.templateType === 'pull';
    const adjacent = all.filter(
      (day, i) =>
        day.some(upper) &&
        [all[i - 1], all[i + 1]].some((d) =>
          (d ?? []).some((w) => w.sport === 'run' && isLongOrKey(w)),
        ),
    );
    expect(adjacent.length).toBeGreaterThan(0);
    // They count as easy for spacing.
    for (const day of all) for (const w of day.filter(upper)) expect(w.hard).toBe(false);
  });

  it('merges a push/pull/legs split into fewer sessions when only 3 days are available', () => {
    const threeDays: Availability = {
      minutesPerDay: [60, 0, 60, 0, 0, 90, 0],
      doublesAllowed: true,
    };
    const p = plan(
      { mode: 'split', split: 'pushPullLegs', daysPerWeek: 3, equipment: 'gym' },
      threeDays,
    );
    const merged = new Set(['legs,upper', 'full_a']);
    for (const w of p.weeks) {
      const strength = w.workouts.filter((x) => x.sport === 'strength');
      const types = strength
        .map((x) => x.templateType)
        .sort()
        .join();
      if (w.phase === 'taper') {
        // Taper keeps one light session from the rotation.
        expect(strength).toHaveLength(1);
        expect(strength.some(isHeavyLegs)).toBe(false);
        continue;
      }
      // Never a lone push without its pull: either the full rotation or a merged version.
      expect(['legs,pull,push', ...merged]).toContain(types);
      expect(w.notes.some((n) => n.key === 'notes.strengthMerged')).toBe(merged.has(types));
    }
    expect(
      p.weeks[0]?.workouts
        .filter((x) => x.sport === 'strength')
        .map((x) => x.templateType)
        .sort(),
    ).toEqual(['legs', 'upper']);
  });

  it('keeps push/pull/legs unmerged when three strength days fit', () => {
    const w = planStrengthWeek(
      { mode: 'split', split: 'pushPullLegs', daysPerWeek: 6 },
      { phase: 'base', isRecovery: false, raceGoal: true, maxSessions: 3, rotation: 0 },
    );
    expect(w.slots.map((s) => s.type)).toEqual(['push', 'pull', 'legs']);
    expect(w.notes).toEqual([]);
  });

  it('logged-only and no-strength setups place no strength sessions', () => {
    for (const mode of ['log', 'none'] as const) {
      expect(
        plan({ mode })
          .weeks.flatMap((w) => w.workouts)
          .some((w) => w.sport === 'strength'),
      ).toBe(false);
    }
  });
});

describe('equipment (§8.6)', () => {
  const GYM_ONLY = ['barbell', 'machine', 'cable'];

  it('home and hotel users never get gym exercises – every split, phase and priority', () => {
    for (const equipment of ['home', 'hotel'] as StrengthEquipment[]) {
      const available = equipmentFor(equipment);
      const setups: StrengthSetup[] = [
        { mode: 'peakr', equipment },
        ...SPLIT_IDS.map((split) => ({ mode: 'split' as const, split, equipment, daysPerWeek: 6 })),
      ];
      for (const setup of setups)
        for (const phase of PHASES)
          for (const priority of PRIORITIES)
            for (const maxSessions of [1, 2, 3, 6]) {
              const week = planStrengthWeek(
                { ...setup, priority },
                { phase, isRecovery: false, raceGoal: true, maxSessions, rotation: 0 },
              );
              for (const slot of week.slots) {
                expect(slot.def.exercises.length).toBeGreaterThan(0);
                for (const e of slot.def.exercises) {
                  const ex = getExercise(e.exerciseId);
                  expect(
                    ex && hasEquipmentFor(ex, available),
                    `${equipment} ${slot.type} ${e.exerciseId}`,
                  ).toBe(true);
                }
              }
            }
    }
    expect(equipmentFor('hotel').some((e) => GYM_ONLY.includes(e))).toBe(false);
    expect(equipmentFor('home').some((e) => GYM_ONLY.includes(e))).toBe(false);
  });

  it('also holds in generated plans', () => {
    for (const equipment of ['home', 'hotel'] as StrengthEquipment[]) {
      const p = plan({ mode: 'split', split: 'pushPullLegs', daysPerWeek: 3, equipment });
      const prescribed = p.weeks.flatMap((w) => w.workouts).flatMap((w) => w.exercises ?? []);
      expect(prescribed.length).toBeGreaterThan(0);
      for (const e of prescribed) {
        expect(
          hasEquipmentFor(getExercise(e.exerciseId) ?? { equipment: [] }, equipmentFor(equipment)),
        ).toBe(true);
      }
    }
  });

  it('swaps within the movement pattern and keeps leg load where possible', () => {
    const legs = getTemplate('strength.legs');
    const def = legs.strength as NonNullable<typeof legs.strength>;
    const home = adaptToEquipment(def, 'heavy', 'home');
    expect(home.changed).toBe(true);
    expect(home.legLoad).toBe('heavy');
    const ids = home.def.exercises.map((e) => e.exerciseId);
    expect(ids.map((id) => getExercise(id)?.pattern)).toEqual(
      def.exercises.map((e) => getExercise(e.exerciseId)?.pattern),
    );
    expect(new Set(ids).size).toBe(ids.length);
    // Nothing to swap → the same object.
    const gym = adaptToEquipment(def, 'heavy', 'gym');
    expect(gym).toEqual({ def, legLoad: 'heavy', changed: false });
  });

  it('borrows from related patterns, drops what cannot be replaced and lowers leg load', () => {
    const arms = adaptToEquipment(
      {
        rpe: 7,
        durationMin: 40,
        exercises: [
          { exerciseId: 'biceps_curl', sets: 3, reps: '10', weightKg: 12 },
          ...Array.from({ length: 8 }, () => ({
            exerciseId: 'triceps_pushdown',
            sets: 3,
            reps: '12',
          })),
          { exerciseId: 'custom:own', sets: 2, reps: '10', legLoad: 'light' as const },
        ],
      },
      'none',
      'hotel',
    );
    const ids = arms.def.exercises.map((e) => e.exerciseId);
    expect(ids[0]).not.toBe('biceps_curl');
    expect(getExercise(ids[0] ?? '')?.pattern).toMatch(/^(pull|push)Horizontal$/);
    expect(arms.def.exercises[0]?.weightKg).toBeUndefined();
    expect(ids.length).toBeLessThan(10);
    expect(ids).toContain('custom:own');
    expect(arms.legLoad).toBe('none');

    const heavyToLight = adaptToEquipment(
      {
        rpe: 8,
        durationMin: 30,
        exercises: [
          { exerciseId: 'leg_press', sets: 3, reps: '10' },
          { exerciseId: 'custom:x', sets: 1, reps: '5' },
        ],
      },
      'heavy',
      'hotel',
    );
    expect(getExercise(heavyToLight.def.exercises[0]?.exerciseId ?? '')?.equipment).toContain(
      'bodyweight',
    );
    expect(heavyToLight.legLoad).toBe('heavy');
    const light = adaptToEquipment(
      {
        rpe: 8,
        durationMin: 30,
        exercises: [{ exerciseId: 'seated_cable_row', sets: 3, reps: '10' }],
      },
      'heavy',
      'hotel',
    );
    expect(light.legLoad).toBe('none');
  });

  it('Peakr programme uses the home sessions for hotel users', () => {
    const w = planStrengthWeek(
      { mode: 'peakr', equipment: 'hotel' },
      { phase: 'base', isRecovery: false, raceGoal: true, maxSessions: 2, rotation: 0 },
    );
    expect(w.slots[0]?.templateId).toBe('strength.peakr_base_home');
    expect(w.slots[0]?.def.exercises.map((e) => e.exerciseId)).not.toContain('goblet_squat');
  });
});

describe('exercise library and custom exercises', () => {
  const custom: CustomExercise = {
    id: 'custom:sled',
    name: 'Sled push',
    pattern: 'squat',
    primaryMuscles: [],
    secondaryMuscles: [],
    muscles: [],
    equipment: ['machine'],
    legLoad: 'heavy',
    unilateral: false,
    trackingMode: 'weightReps',
  };

  it('resolves library and custom exercises', () => {
    expect(resolveExercise('back_squat')?.pattern).toBe('squat');
    expect(resolveExercise('custom:sled', [custom])).toBe(custom);
    expect(resolveExercise('custom:nope', [custom])).toBeUndefined();
  });

  it('validates custom exercises', () => {
    const ok = validateCustomExercise({
      id: 'abc',
      name: '  Sled push ',
      pattern: 'squat',
      equipment: ['machine', 'machine'],
      legLoad: 'heavy',
      instructions: ' Push it. ',
      cues: [' Drive ', ''],
    });
    expect(ok).toEqual({
      ok: true,
      value: { ...custom, id: 'custom:abc', instructions: 'Push it.', cues: ['Drive'] },
    });
    const same = validateCustomExercise({
      id: 'custom:abc',
      name: 'X',
      pattern: 'core',
      equipment: ['band'],
      legLoad: 'none',
      unilateral: true,
      primaryMuscles: ['abs', 'abs'],
      secondaryMuscles: ['abs', 'obliques'],
      instructions: ' ',
    });
    expect(same).toEqual({
      ok: true,
      value: {
        id: 'custom:abc',
        name: 'X',
        pattern: 'core',
        equipment: ['band'],
        legLoad: 'none',
        unilateral: true,
        primaryMuscles: ['abs'],
        secondaryMuscles: ['obliques'],
        muscles: ['abs', 'obliques'],
        trackingMode: 'weightReps',
      },
    });
    expect(
      validateCustomExercise({
        id: 'a',
        name: ' ',
        pattern: 'core',
        equipment: [],
        legLoad: 'none',
      }),
    ).toEqual({
      ok: false,
      issues: [
        { field: 'name', code: 'required' },
        { field: 'equipment', code: 'required' },
      ],
    });
    expect(
      validateCustomExercise({
        id: 'a',
        name: 'x'.repeat(61),
        pattern: 'core',
        equipment: ['band'],
        legLoad: 'none',
      }),
    ).toEqual({
      ok: false,
      issues: [{ field: 'name', code: 'outOfRange', params: { min: 1, max: 60 } }],
    });
  });

  it('bodyweight variations form chains of library exercises', () => {
    for (const chain of progressionChains)
      for (const id of chain) expect(getExercise(id)).toBeDefined();
    expect(nextVariation('push_up')).toBe('feet_elevated_push_up');
    expect(nextVariation('feet_elevated_push_up')).toBe('archer_push_up');
    expect(nextVariation('archer_push_up')).toBeUndefined();
    expect(nextVariation('bench_press')).toBeUndefined();
  });

  it('every library exercise has equipment and every pattern has a hotel option', () => {
    for (const e of exercises) expect(e.equipment.length).toBeGreaterThan(0);
    const hotel = equipmentFor('hotel');
    const patterns = new Set(exercises.map((e) => e.pattern));
    for (const p of patterns) {
      // Borrowed from other patterns (strength-equipment FALLBACK_PATTERNS).
      if (p === 'arms' || p === 'carry') continue;
      expect(
        exercises.some((e) => e.pattern === p && hasEquipmentFor(e, hotel)),
        p,
      ).toBe(true);
    }
  });
});

describe('reps and rest', () => {
  it('parses rep and time ranges', () => {
    expect(parseReps('8–12')).toEqual({ min: 8, max: 12, unit: 'reps' });
    expect(parseReps('8-12')).toEqual({ min: 8, max: 12, unit: 'reps' });
    expect(parseReps('10')).toEqual({ min: 10, max: 10, unit: 'reps' });
    expect(parseReps('30–45 s')).toEqual({ min: 30, max: 45, unit: 'sec' });
    expect(parseReps('45 sec')).toEqual({ min: 45, max: 45, unit: 'sec' });
    expect(parseReps('20 m')).toBeNull();
    expect(parseReps('0')).toBeNull();
    expect(parseReps('12–8')).toBeNull();
  });

  it('rests longer for heavy low-rep work', () => {
    expect(defaultRestSec('back_squat', '4–6')).toBe(150);
    expect(defaultRestSec('bench_press', '8–12')).toBe(90);
    expect(defaultRestSec('glute_bridge', '15–20')).toBe(60);
    expect(defaultRestSec('plank', '10')).toBe(45);
    expect(defaultRestSec('hip_flexor_stretch', '45 s')).toBe(45);
    expect(defaultRestSec('custom:x', '30 s')).toBe(45);
    expect(defaultRestSec('custom:x', '20 m')).toBe(45);
  });

  it('prescriptions carry rest and the routine weight', () => {
    const r = materializeStrength(
      {
        rpe: 7,
        durationMin: 40,
        exercises: [
          { exerciseId: 'back_squat', sets: 3, reps: '5', weightKg: 80 },
          { exerciseId: 'bench_press', sets: 3, reps: '8', restSec: 120 },
        ],
      },
      'heavy',
      1,
      1,
      1,
    );
    expect(r.exercises.map((e) => [e.restSec, e.weightKg])).toEqual([
      [150, 80],
      [120, undefined],
    ]);
  });
});

describe('logging (§8.7)', () => {
  it('quick log: legs yes counts as heavy, no as light', () => {
    expect(summarizeStrengthLog({ kind: 'quick', durationMin: 40, rpe: 8, legs: true })).toEqual({
      rpe: 8,
      load: 160,
      legLoad: 'heavy',
      hard: true,
    });
    expect(
      summarizeStrengthLog({ kind: 'quick', durationMin: 40, rpe: 6, legs: false }),
    ).toMatchObject({
      legLoad: 'light',
      hard: false,
    });
  });

  it('detailed log: heaviest exercise and mean set RPE', () => {
    const custom: CustomExercise[] = [
      {
        id: 'custom:c',
        name: 'C',
        pattern: 'core',
        primaryMuscles: [],
        secondaryMuscles: [],
        muscles: [],
        equipment: ['band'],
        legLoad: 'none',
        unilateral: false,
        trackingMode: 'reps',
      },
    ];
    expect(
      summarizeStrengthLog(
        {
          kind: 'detailed',
          durationMin: 30,
          sets: [
            { exerciseId: 'bench_press', weightKg: 60, reps: 8, rpe: 7 },
            { exerciseId: 'custom:c', reps: 10, rpe: 8 },
          ],
        },
        custom,
      ),
    ).toEqual({ rpe: 7.5, load: 112.5, legLoad: 'none', hard: false });
    expect(
      summarizeStrengthLog({
        kind: 'detailed',
        durationMin: 30,
        sessionRpe: 9,
        sets: [{ exerciseId: 'deadlift', reps: 5 }],
      }),
    ).toMatchObject({ rpe: 9, legLoad: 'heavy', hard: true });
    expect(
      summarizeStrengthLog({
        kind: 'detailed',
        durationMin: 20,
        sets: [{ exerciseId: 'unknown', reps: 5 }],
      }),
    ).toEqual({ rpe: 7, load: 70, legLoad: 'light', hard: false });
  });
});

describe('prefill from last time (§8.5)', () => {
  const squat = { exerciseId: 'back_squat', sets: 3, reps: '8–12', restSec: 90 };
  const bench = { ...squat, exerciseId: 'bench_press' };

  it('first time: bottom of the range with the planned weight', () => {
    expect(prefillExercise({ ...squat, weightKg: 60 }, [])).toEqual({
      exerciseId: 'back_squat',
      restSec: 90,
      sets: [
        { reps: 8, weightKg: 60 },
        { reps: 8, weightKg: 60 },
        { reps: 8, weightKg: 60 },
      ],
    });
  });

  it('double progression: +5 % lower, +2.5 % upper once all sets hit the top at RPE ≤ 8', () => {
    const top = [12, 12, 12].map((reps) => ({ exerciseId: 'x', reps, weightKg: 100, rpe: 8 }));
    expect(prefillExercise(squat, top).sets[0]).toEqual({ reps: 8, weightKg: 105 });
    expect(prefillExercise(bench, top).sets[0]).toEqual({ reps: 8, weightKg: 102.5 });
    expect(
      prefillExercise({ ...bench, exerciseId: 'custom:own' }, top, { custom: [] }).sets[0],
    ).toEqual({ reps: 8, weightKg: 102.5 });
    // Too hard or not at the top: same weight, one more rep.
    expect(
      prefillExercise(
        squat,
        top.map((s) => ({ ...s, rpe: 9 })),
      ).sets[0],
    ).toEqual({ reps: 12, weightKg: 100 });
    expect(
      prefillExercise(squat, [
        { exerciseId: 'x', reps: 9, weightKg: 100 },
        { exerciseId: 'x', reps: 8, weightKg: 100 },
      ]).sets[0],
    ).toEqual({ reps: 9, weightKg: 100 });
  });

  it('after a pause: 85 % of the previous weight; recovery weeks: fewer sets', () => {
    const last = [{ exerciseId: 'x', reps: 10, weightKg: 100, rpe: 7 }];
    expect(prefillExercise(squat, last, { daysSinceLast: 21 }).sets[0]).toEqual({
      reps: 8,
      weightKg: 85,
    });
    expect(prefillExercise(squat, last, { daysSinceLast: 7 }).sets[0]).toEqual({
      reps: 11,
      weightKg: 100,
    });
    expect(prefillExercise({ ...squat, sets: 5 }, last, { isRecovery: true }).sets).toHaveLength(3);
  });

  it('bodyweight: reps up to the top, then the harder variation', () => {
    const push = { exerciseId: 'push_up', sets: 2, reps: '8–15', restSec: 60 };
    expect(
      prefillExercise(push, [
        { exerciseId: 'push_up', reps: 10 },
        { exerciseId: 'push_up', reps: 12 },
      ]).sets,
    ).toEqual([{ reps: 11 }, { reps: 11 }]);
    const top = [
      { exerciseId: 'push_up', reps: 15 },
      { exerciseId: 'push_up', reps: 15 },
    ];
    expect(prefillExercise(push, top)).toEqual({
      exerciseId: 'feet_elevated_push_up',
      variationOf: 'push_up',
      restSec: 60,
      sets: [{ reps: 8 }, { reps: 8 }],
    });
    // End of the chain, or after a pause: stay.
    expect(prefillExercise({ ...push, exerciseId: 'archer_push_up' }, top).sets[0]).toEqual({
      reps: 15,
    });
    expect(prefillExercise(push, top, { daysSinceLast: 30 })).toMatchObject({
      exerciseId: 'push_up',
      sets: [{ reps: 8 }, { reps: 8 }],
    });
  });

  it('timed exercises keep the best time within the range', () => {
    const plank = { exerciseId: 'plank', sets: 3, reps: '30–45 s', restSec: 45 };
    expect(prefillExercise(plank, []).sets[0]).toEqual({ durationSec: 30 });
    expect(
      prefillExercise(plank, [{ exerciseId: 'plank', durationSec: 40 }, { exerciseId: 'plank' }])
        .sets[0],
    ).toEqual({ durationSec: 40 });
    expect(prefillExercise(plank, [{ exerciseId: 'plank', durationSec: 90 }]).sets[0]).toEqual({
      durationSec: 45,
    });
    expect(
      prefillExercise(plank, [{ exerciseId: 'plank', durationSec: 40 }], { daysSinceLast: 30 })
        .sets[0],
    ).toEqual({ durationSec: 30 });
  });

  it('free-text reps keep the planned weight', () => {
    expect(
      prefillExercise(
        { exerciseId: 'custom:sled', sets: 2, reps: '20 m', restSec: 90, weightKg: 40 },
        [],
      ).sets,
    ).toEqual([{ weightKg: 40 }, { weightKg: 40 }]);
  });
});
