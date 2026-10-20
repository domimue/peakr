import { describe, expect, it } from 'vitest';

import { exercises, getExercise, parseExerciseRecords, type CustomExercise } from '../plan/library';
import { summarizeStrengthLog } from '../plan/strength-log';
import { parseReps } from '../plan/strength-reps';
import type { Routine } from '../plan/types';
import { assertDefined } from '../result';
import {
  migrateStrengthData,
  migrateStrengthLog,
  type LegacyCustomExercise,
  type LegacyStrengthLog,
} from './migrate';
import { lastSetsOf, toStrengthLog } from './plan-bridge';
import { estimateOneRepMax, findNewRecords } from './records';
import {
  cleanSupersets,
  duplicateRoutine,
  estimateRoutineMinutes,
  groupSuperset,
  moveRoutineExercise,
  starterRoutines,
  STARTER_SPLITS,
  targetFromText,
  targetToText,
  toPlanRoutine,
  ungroupSuperset,
} from './routines';
import { summarizeSession } from './summary';
import type { GymRoutine, GymRoutineExercise, GymSession, GymSet } from './types';
import { displayWeight, fromKg, KG_PER_LB, roundToStep, toKg, toMetres } from './units';

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

const session = (over: Partial<GymSession> = {}): GymSession => ({
  id: 's1',
  date: '2026-10-20',
  startedAt: Date.UTC(2026, 9, 20, 17, 0),
  endedAt: Date.UTC(2026, 9, 20, 18, 5),
  title: 'Push',
  kind: 'detailed',
  source: 'app',
  ...over,
});

let setNo = 0;
const set = (over: Partial<GymSet> & Pick<GymSet, 'exerciseId'>): GymSet => ({
  id: `set${++setNo}`,
  sessionId: 's1',
  setIndex: setNo,
  setType: 'working',
  completed: true,
  loggedAt: Date.UTC(2026, 9, 20, 17, 30),
  ...over,
});

describe('units', () => {
  it('converts kg and lb exactly and round-trips', () => {
    expect(toKg(1, 'lb')).toBe(KG_PER_LB);
    expect(toKg(100, 'kg')).toBe(100);
    for (const lb of [45, 135, 225, 2.5, 315]) {
      expect(fromKg(toKg(lb, 'lb'), 'lb')).toBeCloseTo(lb, 10);
    }
    for (const kg of [20, 62.5, 100, 1.25]) {
      expect(toKg(fromKg(kg, 'lb'), 'lb')).toBeCloseTo(kg, 10);
    }
  });

  it('rounds for display without float noise', () => {
    expect(displayWeight(toKg(135, 'lb'), 'lb')).toBe(135);
    expect(displayWeight(toKg(135, 'lb'), 'kg')).toBe(61.2);
    expect(displayWeight(100, 'lb')).toBe(220.5);
    expect(roundToStep(61.3, 2.5)).toBe(62.5);
    expect(roundToStep(61.2, 2.5)).toBe(60);
    expect(roundToStep(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(roundToStep(7, 0)).toBe(7);
  });

  it('converts distances', () => {
    expect(toMetres(1.5, 'km')).toBe(1500);
    expect(toMetres(1, 'mi')).toBeCloseTo(1609.344, 6);
  });
});

describe('session summary: volume, sets, reps, muscles', () => {
  const sets: GymSet[] = [
    set({ exerciseId: 'bench_press', setType: 'warmup', weightKg: 40, reps: 10 }),
    set({ exerciseId: 'bench_press', weightKg: 80, reps: 8 }),
    set({ exerciseId: 'bench_press', weightKg: 80, reps: 7 }),
    set({ exerciseId: 'bench_press', setType: 'drop', weightKg: 60, reps: 10 }),
    // Not completed: ignored everywhere.
    set({ exerciseId: 'bench_press', weightKg: 80, reps: 6, completed: false }),
    set({ exerciseId: 'push_up', reps: 20 }),
    set({ exerciseId: 'plank', durationSec: 60 }),
    // Another session's set is not part of this summary.
    set({ exerciseId: 'bench_press', sessionId: 'other', weightKg: 200, reps: 1 }),
  ];

  it('sums weight × reps of completed working sets only', () => {
    const s = summarizeSession(session(), sets);
    expect(s.volumeKg).toBe(80 * 8 + 80 * 7 + 60 * 10);
    expect(s.sets).toBe(5);
    expect(s.warmupSets).toBe(1);
    expect(s.reps).toBe(8 + 7 + 10 + 20);
    expect(s.durationMin).toBe(65);
  });

  it('counts sets per muscle group: primary 1, secondary 0.5', () => {
    const s = summarizeSession(session(), sets);
    const m = Object.fromEntries(s.muscles.map((x) => [x.muscle, x.sets]));
    // bench ×3 + push-up: chest and triceps primary; front delts secondary (+ plank's).
    expect(m.chest).toBe(4);
    expect(m.triceps).toBe(4);
    expect(m.front_delts).toBe(4 * 0.5 + 0.5);
    expect(m.abs).toBe(1 + 0.5);
    expect(s.muscles[0]?.sets).toBeGreaterThanOrEqual(s.muscles[1]?.sets ?? 0);
  });

  it('resolves custom exercises for muscles', () => {
    const custom: CustomExercise = {
      id: 'custom:x',
      name: 'X',
      pattern: 'other',
      primaryMuscles: ['neck'],
      secondaryMuscles: [],
      muscles: ['neck'],
      equipment: ['machine'],
      legLoad: 'none',
      unilateral: false,
      trackingMode: 'weightReps',
    };
    const s = summarizeSession(
      session(),
      [set({ exerciseId: 'custom:x', weightKg: 10, reps: 10 })],
      [],
      [custom],
    );
    expect(s.muscles).toEqual([{ muscle: 'neck', sets: 1 }]);
  });

  it('duration: quick logs and sessions without an end time', () => {
    expect(summarizeSession(session({ kind: 'quick', durationMin: 40 }), []).durationMin).toBe(40);
    const open = session({ endedAt: undefined });
    const late = set({ exerciseId: 'push_up', reps: 10, loggedAt: open.startedAt + 42 * 60000 });
    expect(summarizeSession(open, [late]).durationMin).toBe(42);
    expect(summarizeSession(session({ endedAt: undefined, durationMin: 50 }), []).durationMin).toBe(
      50,
    );
  });
});

describe('personal records', () => {
  const old = (over: Partial<GymSet> & Pick<GymSet, 'exerciseId'>) =>
    set({ sessionId: 'old', ...over });

  it('estimates 1RM with Epley', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 10)).toBeCloseTo(133.33, 2);
    expect(estimateOneRepMax(0, 5)).toBe(0);
  });

  it('reports weight, 1RM and set volume records against earlier sets', () => {
    const history = [old({ exerciseId: 'bench_press', weightKg: 80, reps: 5 })];
    const now = [
      set({ exerciseId: 'bench_press', weightKg: 82.5, reps: 5 }),
      set({ exerciseId: 'bench_press', weightKg: 85, reps: 3 }),
    ];
    const records = findNewRecords(now, history);
    const byKind = Object.fromEntries(records.map((r) => [r.kind, r]));
    expect(byKind.weight?.value).toBe(85);
    expect(byKind.weight?.previous).toBe(80);
    // One record per kind: the best set of the session.
    expect(records.filter((r) => r.kind === 'weight')).toHaveLength(1);
    expect(byKind.setVolume?.value).toBe(82.5 * 5);
    expect(byKind.oneRm?.value).toBeCloseTo(82.5 * (1 + 5 / 30), 6);
  });

  it('a first log, a tie, warm-ups and unfinished sets are no records', () => {
    expect(findNewRecords([set({ exerciseId: 'deadlift', weightKg: 140, reps: 5 })], [])).toEqual(
      [],
    );
    const history = [old({ exerciseId: 'deadlift', weightKg: 140, reps: 5 })];
    expect(
      findNewRecords([set({ exerciseId: 'deadlift', weightKg: 140, reps: 5 })], history),
    ).toEqual([]);
    expect(
      findNewRecords(
        [
          set({ exerciseId: 'deadlift', weightKg: 200, reps: 1, setType: 'warmup' }),
          set({ exerciseId: 'deadlift', weightKg: 200, reps: 1, completed: false }),
        ],
        history,
      ),
    ).toEqual([]);
    // Warm-ups in the history do not raise the bar either.
    const warmHistory = [old({ exerciseId: 'squat', weightKg: 300, reps: 1, setType: 'warmup' })];
    expect(
      findNewRecords([set({ exerciseId: 'squat', weightKg: 100, reps: 5 })], warmHistory),
    ).toEqual([]);
  });

  it('bodyweight reps, time and distance records; no 1RM above 12 reps', () => {
    const history = [
      old({ exerciseId: 'pull_up', reps: 8 }),
      old({ exerciseId: 'plank', durationSec: 60 }),
      old({ exerciseId: 'farmer_carry', weightKg: 30, distanceM: 40 }),
      old({ exerciseId: 'leg_extension', weightKg: 50, reps: 12 }),
    ];
    const kinds = findNewRecords(
      [
        set({ exerciseId: 'pull_up', reps: 10 }),
        set({ exerciseId: 'plank', durationSec: 75 }),
        set({ exerciseId: 'farmer_carry', weightKg: 30, distanceM: 50 }),
        set({ exerciseId: 'leg_extension', weightKg: 50, reps: 15 }),
      ],
      history,
    ).map((r) => `${r.exerciseId}:${r.kind}`);
    expect(kinds).toEqual([
      'farmer_carry:distance',
      'leg_extension:setVolume',
      'plank:duration',
      'pull_up:reps',
    ]);
  });

  it('summary records ignore the session itself in the history', () => {
    const own = set({ exerciseId: 'bench_press', weightKg: 100, reps: 1 });
    const history = [
      own,
      set({ exerciseId: 'bench_press', sessionId: 'old', weightKg: 90, reps: 1 }),
    ];
    const s = summarizeSession(session(), [own], history);
    expect(s.records.map((r) => r.kind)).toContain('weight');
  });
});

describe('routines', () => {
  const entry = (id: string, over: Partial<GymRoutineExercise> = {}): GymRoutineExercise => ({
    id,
    exerciseId: 'bench_press',
    targetSets: 3,
    target: { kind: 'reps', min: 8, max: 12 },
    restSec: 90,
    ...over,
  });

  it('targets round-trip through the plan text', () => {
    for (const text of ['8–12', '5', '30–45 s', '45 s', '20 m']) {
      const t = targetFromText(text);
      expect(t).not.toBeNull();
      expect(targetToText(assertDefined(t, text))).toBe(text);
    }
    expect(targetFromText('8-12')).toEqual({ kind: 'reps', min: 8, max: 12 });
    expect(targetFromText('AMRAP')).toBeNull();
    expect(parseReps(targetToText({ kind: 'time', minSec: 30, maxSec: 45 }))?.unit).toBe('sec');
  });

  it('estimates minutes; supersets share their rest', () => {
    const straight = [entry('a'), entry('b')];
    const superset = [entry('a', { supersetGroup: 'g' }), entry('b', { supersetGroup: 'g' })];
    // 2 × (3 × (36 + 90) + 60) = 876 s → 15 min
    expect(estimateRoutineMinutes(straight)).toBe(15);
    expect(estimateRoutineMinutes(superset)).toBeLessThan(estimateRoutineMinutes(straight));
    expect(estimateRoutineMinutes([])).toBe(5);
  });

  it('groups supersets into one block and dissolves broken ones', () => {
    const list = [entry('a'), entry('b'), entry('c'), entry('d')];
    const grouped = groupSuperset(list, ['a', 'c'], 'g1');
    expect(grouped.map((e) => e.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(grouped.filter((e) => e.supersetGroup === 'g1').map((e) => e.id)).toEqual(['a', 'c']);
    // A single entry is no superset.
    expect(groupSuperset(list, ['a'], 'g2')).toEqual(list);
    // Moving one member away dissolves the pair.
    const moved = moveRoutineExercise(grouped, 0, 3);
    expect(moved.map((e) => e.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(moved.every((e) => e.supersetGroup === undefined)).toBe(true);
    // Moving a non-member keeps the block.
    expect(
      moveRoutineExercise(grouped, 3, 0)
        .filter((e) => e.supersetGroup)
        .map((e) => e.id),
    ).toEqual(['a', 'c']);
    expect(ungroupSuperset(grouped, 'g1').some((e) => e.supersetGroup)).toBe(false);
    const split = [
      entry('a', { supersetGroup: 'x' }),
      entry('b'),
      entry('c', { supersetGroup: 'x' }),
    ];
    expect(cleanSupersets(split).some((e) => e.supersetGroup)).toBe(false);
  });

  it('duplicates with new ids and keeps supersets together', () => {
    const routine: GymRoutine = {
      id: 'r1',
      name: 'Push',
      position: 2,
      archivedAt: 5,
      exercises: [
        entry('a', { supersetGroup: 'g' }),
        entry('b', { supersetGroup: 'g' }),
        entry('c'),
      ],
    };
    const copy = duplicateRoutine(routine, ids(), 'Push (copy)');
    expect(copy.id).not.toBe('r1');
    expect(copy.name).toBe('Push (copy)');
    expect(copy.archivedAt).toBeUndefined();
    expect(new Set(copy.exercises.map((e) => e.id)).size).toBe(3);
    const groups = copy.exercises.map((e) => e.supersetGroup);
    expect(groups[0]).toBe(groups[1]);
    expect(groups[0]).not.toBe('g');
    expect(groups[2]).toBeUndefined();
  });

  it('becomes a plan routine the scheduler understands', () => {
    const plan = toPlanRoutine({
      id: 'r1',
      name: 'Legs',
      position: 0,
      exercises: [
        entry('a', {
          exerciseId: 'back_squat',
          target: { kind: 'reps', min: 5, max: 5 },
          weightKg: 100,
        }),
        entry('b', { exerciseId: 'custom:gone', target: { kind: 'time', minSec: 30, maxSec: 45 } }),
      ],
    });
    expect(plan.durationMin).toBeGreaterThan(0);
    expect(plan.exercises).toEqual([
      { exerciseId: 'back_squat', sets: 3, reps: '5', restSec: 90, weightKg: 100 },
      { exerciseId: 'custom:gone', sets: 3, reps: '30–45 s', restSec: 90, legLoad: 'light' },
    ]);
  });

  it('starter routines exist for every offered split, with library exercises only', () => {
    for (const split of STARTER_SPLITS) {
      const { folder, routines } = starterRoutines(split, {
        newId: ids(),
        folderName: split,
        routineName: (type) => `R ${type}`,
      });
      expect(routines.length).toBeGreaterThanOrEqual(2);
      for (const r of routines) {
        expect(r.folderId).toBe(folder.id);
        expect(r.exercises.length).toBeGreaterThan(0);
        for (const e of r.exercises) expect(getExercise(e.exerciseId), e.exerciseId).toBeDefined();
      }
    }
    const ppl = starterRoutines('pushPullLegs', {
      newId: ids(),
      folderName: 'PPL',
      routineName: (t) => t,
    });
    expect(ppl.routines.map((r) => r.name)).toEqual(['push', 'pull', 'legs']);
    expect(ppl.routines.map((r) => r.position)).toEqual([0, 1, 2]);
  });
});

describe('plan bridge', () => {
  it('turns sessions into the strength logs the load model reads', () => {
    const s = session({ sessionRpe: 8 });
    const sets = [
      set({ exerciseId: 'back_squat', setType: 'warmup', weightKg: 60, reps: 5, setIndex: 0 }),
      set({ exerciseId: 'back_squat', weightKg: 100, reps: 5, rpe: 8, setIndex: 1 }),
    ];
    const log = toStrengthLog(s, sets);
    expect(log).toEqual({
      kind: 'detailed',
      durationMin: 65,
      sessionRpe: 8,
      sets: [{ exerciseId: 'back_squat', weightKg: 100, reps: 5, rpe: 8 }],
    });
    expect(summarizeStrengthLog(log).legLoad).toBe('heavy');
    expect(toStrengthLog(session({ kind: 'quick', durationMin: 30, legs: true }), [])).toEqual({
      kind: 'quick',
      durationMin: 30,
      rpe: 7,
      legs: true,
    });
  });

  it('finds the last working sets of an exercise', () => {
    const older = session({ id: 'a', date: '2026-10-01', startedAt: 1 });
    const newer = session({ id: 'b', date: '2026-10-10', startedAt: 2 });
    const sets = [
      set({ sessionId: 'a', exerciseId: 'bench_press', weightKg: 70, reps: 8 }),
      set({ sessionId: 'b', exerciseId: 'bench_press', weightKg: 75, reps: 8, setIndex: 2 }),
      set({
        sessionId: 'b',
        exerciseId: 'bench_press',
        weightKg: 40,
        reps: 8,
        setType: 'warmup',
        setIndex: 1,
      }),
    ];
    expect(lastSetsOf('bench_press', [older, newer], sets)).toEqual({
      date: '2026-10-10',
      sets: [{ exerciseId: 'bench_press', weightKg: 75, reps: 8 }],
    });
    expect(lastSetsOf('deadlift', [older, newer], sets)).toBeNull();
  });
});

describe('Phase 3 migration', () => {
  const routines: Routine[] = [
    {
      id: 'r1',
      name: 'Legs',
      durationMin: 50,
      exercises: [
        { exerciseId: 'back_squat', sets: 4, reps: '5', weightKg: 100 },
        { exerciseId: 'custom:sled', sets: 3, reps: '20 m', restSec: 120 },
        { name: 'Hevy: Belt squat', sets: 3, reps: '10', legLoad: 'heavy' },
        { exerciseId: 'plank', sets: 3, reps: 'AMRAP' },
      ],
    },
    {
      id: 'r2',
      name: 'Upper',
      durationMin: 40,
      exercises: [{ exerciseId: 'bench_press', sets: 3, reps: '8–12' }],
    },
  ];
  const customExercises: LegacyCustomExercise[] = [
    {
      id: 'custom:sled',
      name: 'Sled push',
      pattern: 'squat',
      muscles: ['quads', 'shoulders', 'core', 'mystery'],
      equipment: ['machine', 'sled'],
      legLoad: 'heavy',
      unilateral: false,
      howTo: 'Push the sled.',
    },
  ];
  const logs: LegacyStrengthLog[] = [
    {
      id: 'l1',
      date: '2026-09-01',
      title: 'Legs',
      sourceId: 'routine:r1',
      createdAt: Date.UTC(2026, 8, 1, 19, 0),
      log: {
        kind: 'detailed',
        durationMin: 50,
        sessionRpe: 8,
        sets: [
          { exerciseId: 'back_squat', weightKg: 100, reps: 5, rpe: 8 },
          { exerciseId: 'back_squat', weightKg: 100, reps: 5 },
          { exerciseId: 'custom:sled', durationSec: 30 },
          { exerciseId: 'custom:r1:2', reps: 10 },
        ],
      },
    },
    {
      id: 'l2',
      date: '2026-09-03',
      title: '',
      sourceId: null,
      createdAt: Date.UTC(2026, 8, 3, 7, 0),
      log: { kind: 'quick', durationMin: 30, rpe: 6, legs: true },
    },
  ];

  const out = migrateStrengthData({ routines, customExercises, logs }, ids());

  it('keeps every routine, entry and value', () => {
    expect(out.routines.map((r) => [r.id, r.name, r.position, r.durationMin])).toEqual([
      ['r1', 'Legs', 0, 50],
      ['r2', 'Upper', 1, 40],
    ]);
    const legs = assertDefined(out.routines[0], 'legs').exercises;
    expect(legs).toHaveLength(4);
    expect(legs[0]).toMatchObject({
      exerciseId: 'back_squat',
      targetSets: 4,
      target: { kind: 'reps', min: 5, max: 5 },
      weightKg: 100,
    });
    expect(legs[1]).toMatchObject({
      exerciseId: 'custom:sled',
      target: { kind: 'distance', m: 20 },
      restSec: 120,
    });
    // Free text becomes a custom exercise with the id Phase 3 logs used.
    expect(legs[2]).toMatchObject({ exerciseId: 'custom:r1:2', legLoad: 'heavy', targetSets: 3 });
    // Unparseable targets survive in the notes.
    expect(legs[3]).toMatchObject({ exerciseId: 'plank', notes: 'AMRAP' });
    // The plan sees the same routine as before.
    const plan = toPlanRoutine(assertDefined(out.routines[0], 'r'), out.exercises);
    expect(plan.exercises.map((e) => [e.exerciseId, e.sets, e.reps])).toEqual([
      ['back_squat', 4, '5'],
      ['custom:sled', 3, '20 m'],
      ['custom:r1:2', 3, '10'],
      ['plank', 3, '8–12'],
    ]);
  });

  it('keeps custom exercises and maps old muscle words', () => {
    const sled = out.exercises.find((e) => e.id === 'custom:sled');
    expect(sled).toMatchObject({
      name: 'Sled push',
      pattern: 'squat',
      legLoad: 'heavy',
      equipment: ['machine'],
      instructions: 'Push the sled.',
      primaryMuscles: ['quads', 'front_delts', 'side_delts', 'abs'],
    });
    const belt = out.exercises.find((e) => e.id === 'custom:r1:2');
    expect(belt).toMatchObject({ name: 'Hevy: Belt squat', legLoad: 'heavy' });
    expect(out.exercises).toHaveLength(2);
  });

  it('keeps every log and every set in order', () => {
    expect(out.sessions).toHaveLength(2);
    expect(out.sets).toHaveLength(4);
    const detailed = assertDefined(
      out.sessions.find((s) => s.id === 'l1'),
      'l1',
    );
    expect(detailed).toMatchObject({
      date: '2026-09-01',
      kind: 'detailed',
      routineId: 'r1',
      sourceId: 'routine:r1',
      sessionRpe: 8,
      source: 'migrated',
      endedAt: logs[0]?.createdAt,
      startedAt: (logs[0]?.createdAt ?? 0) - 50 * 60000,
    });
    expect(
      out.sets.map((s) => [s.exerciseId, s.setIndex, s.weightKg, s.reps, s.durationSec, s.rpe]),
    ).toEqual([
      ['back_squat', 0, 100, 5, undefined, 8],
      ['back_squat', 1, 100, 5, undefined, undefined],
      ['custom:sled', 2, undefined, undefined, 30, undefined],
      ['custom:r1:2', 3, undefined, 10, undefined, undefined],
    ]);
    const quick = assertDefined(
      out.sessions.find((s) => s.id === 'l2'),
      'l2',
    );
    expect(quick).toMatchObject({ kind: 'quick', durationMin: 30, sessionRpe: 6, legs: true });
  });

  it('the load model sees the same session before and after', () => {
    for (const log of logs) {
      const { session: s, sets } = migrateStrengthLog(log, ids());
      expect(summarizeStrengthLog(toStrengthLog(s, sets), out.exercises)).toEqual(
        summarizeStrengthLog(log.log, out.exercises),
      );
    }
  });
});

describe('exercise library', () => {
  it('has at least 150 exercises with machines and cables as priority', () => {
    expect(exercises.length).toBeGreaterThanOrEqual(150);
    const machineOrCable = exercises.filter((e) =>
      e.equipment.some((q) => q === 'machine' || q === 'cable' || q === 'smith'),
    );
    expect(machineOrCable.length).toBeGreaterThanOrEqual(60);
    for (const eq of ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band'] as const) {
      expect(
        exercises.some((e) => e.equipment.includes(eq)),
        eq,
      ).toBe(true);
    }
  });

  it('every exercise has muscles, equipment and a tracking mode', () => {
    for (const e of exercises) {
      expect(e.primaryMuscles.length, e.id).toBeGreaterThan(0);
      expect(
        e.secondaryMuscles.some((m) => e.primaryMuscles.includes(m)),
        e.id,
      ).toBe(false);
      expect(e.equipment.length, e.id).toBeGreaterThan(0);
      expect(e.howToKey).toBe(`exercises.${e.id}`);
    }
  });

  it('rejects bad data loudly', () => {
    const ok = {
      id: 'x',
      pattern: 'squat',
      primary: ['quads'],
      equipment: ['machine'],
      legLoad: 'light',
      tracking: 'weightReps',
    };
    expect(parseExerciseRecords([ok])).toHaveLength(1);
    expect(() => parseExerciseRecords([ok, ok])).toThrow(/duplicate/);
    expect(() => parseExerciseRecords([{ ...ok, pattern: 'jog' }])).toThrow(/pattern/);
    expect(() => parseExerciseRecords([{ ...ok, primary: ['wings'] }])).toThrow(/muscle/);
    expect(() => parseExerciseRecords([{ ...ok, primary: [] }])).toThrow(/no muscles/);
    expect(() => parseExerciseRecords([{ ...ok, equipment: [] }])).toThrow(/no equipment/);
    expect(() => parseExerciseRecords([{ ...ok, tracking: 'vibes' }])).toThrow(/tracking/);
    expect(() => parseExerciseRecords([{ ...ok, id: 'Bad Id' }])).toThrow(/bad id/);
  });
});
