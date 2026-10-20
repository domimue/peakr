import { describe, expect, it } from 'vitest';

import {
  copyInputOf,
  getExercise,
  isCustomExercise,
  parseExerciseRecords,
  resolveExercise,
  validateCustomExercise,
} from '../plan/library';
import { assertDefined } from '../result';
import {
  buildImport,
  customFromImport,
  detectMapping,
  groupSessions,
  parseSetType,
  readRows,
  routineFromImport,
} from './csv/import';
import { createMatcher, guessTrackingMode, normaliseName } from './csv/match';
import { parseCsv, parseRecords } from './csv/parse';
import { parseDateTime } from './csv/values';
import { migrateCustomExercise, migrateRoutine, migrateStrengthLog } from './migrate';
import { lastSetsOf, toStrengthLog } from './plan-bridge';
import { bestsByExercise } from './records';
import {
  activeRoutines,
  estimateRoutineMinutes,
  groupSuperset,
  moveRoutineExercise,
  routineMinutes,
} from './routines';
import { summarizeSession } from './summary';
import { SET_TYPES, type GymRoutine, type GymSession, type GymSet } from './types';
import { fromMetres } from './units';

/** Corrupt rows, missing optional values and rarely used paths. */

const ids = () => {
  let n = 0;
  return () => `e${++n}`;
};

const session: GymSession = {
  id: 's',
  date: '2026-10-20',
  startedAt: 0,
  title: '',
  kind: 'detailed',
  source: 'app',
};

const set = (over: Partial<GymSet>): GymSet => ({
  id: 'x',
  sessionId: 's',
  exerciseId: 'bench_press',
  setIndex: 0,
  setType: 'working',
  completed: true,
  loggedAt: 0,
  ...over,
});

describe('migration of corrupt or sparse Phase 3 rows', () => {
  it('custom exercises with unknown values still come across', () => {
    const e = migrateCustomExercise({
      id: 'custom:x',
      name: '   ',
      pattern: 'dance',
      equipment: ['sled'],
      legLoad: 'none',
    });
    expect(e).toMatchObject({
      id: 'custom:x',
      name: 'custom:x',
      pattern: 'other',
      equipment: ['bodyweight'],
      primaryMuscles: [],
      unilateral: false,
    });
    expect(e.instructions).toBeUndefined();
    const stretch = migrateCustomExercise({
      id: 'custom:s',
      name: 'x'.repeat(80),
      pattern: 'mobility',
      equipment: ['band', 'band'],
      legLoad: 'none',
      howTo: '  ',
    });
    expect(stretch.name).toHaveLength(60);
    expect(stretch.trackingMode).toBe('time');
    expect(stretch.equipment).toEqual(['band']);
  });

  it('free-text entries without a name are named after the routine', () => {
    const { exercises, routine } = migrateRoutine(
      { id: 'r', name: 'Imported', durationMin: 30, exercises: [{ sets: 2, reps: '10' }] },
      0,
      ids(),
    );
    expect(exercises[0]).toMatchObject({ id: 'custom:r:0', name: 'Imported 1', legLoad: 'light' });
    expect(routine.exercises[0]?.exerciseId).toBe('custom:r:0');
  });

  it('detailed logs without a session RPE', () => {
    const { session: s } = migrateStrengthLog(
      {
        id: 'l',
        date: '2026-01-01',
        title: 'T',
        sourceId: 'strength.push',
        createdAt: 3_600_000,
        log: { kind: 'detailed', durationMin: 60, sets: [] },
      },
      ids(),
    );
    expect(s.sessionRpe).toBeUndefined();
    expect(s.routineId).toBeUndefined();
    expect(s.sourceId).toBe('strength.push');
    expect(s.startedAt).toBe(0);
  });
});

describe('plan bridge and summaries without optional values', () => {
  it('quick sessions without RPE, legs or duration', () => {
    expect(toStrengthLog({ ...session, kind: 'quick' }, [])).toEqual({
      kind: 'quick',
      durationMin: 0,
      rpe: 7,
      legs: false,
    });
    expect(summarizeSession({ ...session, kind: 'quick' }, []).durationMin).toBe(0);
  });

  it('detailed sessions without RPE keep set order; unknown exercises add no muscles', () => {
    const sets = [
      set({ id: 'b', setIndex: 1, reps: 5 }),
      set({ id: 'a', setIndex: 0, reps: 6 }),
      set({ id: 'c', setIndex: 2, exerciseId: 'custom:gone', reps: 1 }),
    ];
    const log = toStrengthLog({ ...session, endedAt: 60_000 }, sets);
    expect(log).toEqual({
      kind: 'detailed',
      durationMin: 1,
      sets: [
        { exerciseId: 'bench_press', reps: 6 },
        { exerciseId: 'bench_press', reps: 5 },
        { exerciseId: 'custom:gone', reps: 1 },
      ],
    });
    expect(lastSetsOf('bench_press', [session], sets)?.sets.map((s) => s.reps)).toEqual([6, 5]);
    const summary = summarizeSession({ ...session, endedAt: 60_000 }, sets);
    expect(summary.muscles.some((m) => m.muscle === 'chest')).toBe(true);
    expect(summary.sets).toBe(3);
  });

  it('bests keep the highest value whatever the order', () => {
    const bests = bestsByExercise([
      set({ weightKg: 100, reps: 1 }),
      set({ weightKg: 80, reps: 1 }),
    ]);
    expect(bests.get('bench_press')?.weight).toBe(100);
  });
});

describe('routines and units', () => {
  it('distance targets, archived routines and fixed durations', () => {
    expect(
      estimateRoutineMinutes([
        {
          id: 'a',
          exerciseId: 'farmer_carry',
          targetSets: 3,
          target: { kind: 'distance', m: 300 },
          restSec: 60,
        },
      ]),
    ).toBe(10);
    const r = (id: string, over: Partial<GymRoutine> = {}): GymRoutine => ({
      id,
      name: id,
      position: 0,
      exercises: [],
      ...over,
    });
    expect(activeRoutines([r('a'), r('b', { archivedAt: 1 })]).map((x) => x.id)).toEqual(['a']);
    expect(routineMinutes(r('a', { durationMin: 42 }))).toBe(42);
    expect(routineMinutes(r('a'))).toBe(5);
    expect(fromMetres(1609.344, 'mi')).toBeCloseTo(1, 10);
  });
});

describe('library helpers', () => {
  it('tells custom from library exercises and prepares editable copies', () => {
    const squat = assertDefined(getExercise('back_squat'), 'squat');
    expect(isCustomExercise(squat)).toBe(false);
    const input = copyInputOf(squat, { name: 'My squat', cues: ['Brace'] }, 'copy1');
    expect(input).toMatchObject({
      id: 'copy1',
      name: 'My squat',
      basedOn: 'back_squat',
      pattern: 'squat',
      legLoad: 'heavy',
      trackingMode: 'weightReps',
      primaryMuscles: ['quads', 'glutes'],
    });
    expect(input.primaryMuscles).not.toBe(squat.primaryMuscles);
    expect(resolveExercise('custom:none')).toBeUndefined();
  });
});

describe('CSV corner cases', () => {
  it('invalid times in every date format', () => {
    for (const s of [
      '2026-01-18 25:00',
      '2026-01-18 7pm',
      '18 Jan 2026 x',
      '18 Foo 2026',
      'Jan 18 2026 x',
      'Foo 18 2026',
      '18.01.2026 x',
      '01/18/2026 x',
      '2026-13-01',
    ]) {
      expect(parseDateTime(s), s).toBeNull();
    }
    expect(parseDateTime('2026-01-18 12:00 AM')?.hour).toBe(0);
    expect(parseDateTime('2026-01-18 12:30 pm')?.hour).toBe(12);
  });

  it('line breaks inside quotes count towards line numbers', () => {
    expect(parseRecords('"a\r\nb"\r\nc', ',').map((r) => r.line)).toEqual([1, 3]);
    expect(parseRecords('"a\rb"\nc', ',').map((r) => r.line)).toEqual([1, 3]);
    expect(parseRecords('a,', ',')).toEqual([{ fields: ['a', ''], line: 1 }]);
  });

  it('tracking mode from the data an export has', () => {
    const d = (o: Partial<Record<'weight' | 'reps' | 'duration' | 'distance', boolean>>) => ({
      weight: false,
      reps: false,
      duration: false,
      distance: false,
      ...o,
    });
    expect(guessTrackingMode(d({ distance: true }))).toBe('distance');
    expect(guessTrackingMode(d({ weight: true, duration: true }))).toBe('weightTime');
    expect(guessTrackingMode(d({ duration: true }))).toBe('time');
    expect(guessTrackingMode(d({ weight: true, reps: true }))).toBe('weightReps');
    expect(guessTrackingMode(d({ reps: true }))).toBe('reps');
    expect(customFromImport('Arm Circles', d({ reps: true }), 'custom:c').equipment).toEqual([
      'bodyweight',
    ]);
  });

  it('imports with the local time zone, without duration, title or mapped extras', () => {
    const table = parseCsv(
      'Date,Exercise,Reps\n2026-05-01 10:00,Push Up,10\n2026-05-01 10:00,Unknown,5',
    );
    const { rows } = readRows(table, {
      columns: { startTime: 0, exerciseName: 1, reps: 2, endTime: 9, sessionDuration: 9 },
      weightUnit: 'kg',
      distanceUnit: 'km',
      dayFirst: false,
    });
    const drafts = groupSessions(rows);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.durationMin).toBeUndefined();
    const built = buildImport(drafts, {
      source: 'import:csv',
      exerciseIds: { 'Push Up': 'push_up' },
      newId: ids(),
    });
    expect(built.sessions[0]).toMatchObject({
      date: '2026-05-01',
      startedAt: new Date(2026, 4, 1, 10, 0, 0).getTime(),
      title: '',
    });
    expect(built.sessions[0]?.endedAt).toBeUndefined();
    // Rows of exercises the user left unresolved are not imported.
    expect(built.sets.map((s) => s.exerciseId)).toEqual(['push_up']);
  });
});

describe('remaining paths', () => {
  it('superset grouping after the first entry and out-of-range moves', () => {
    const e = (id: string) => ({
      id,
      exerciseId: 'bench_press',
      targetSets: 1,
      target: { kind: 'reps' as const, min: 5, max: 5 },
      restSec: 60,
    });
    const list = [e('a'), e('b'), e('c'), e('d')];
    expect(groupSuperset(list, ['b', 'd'], 'g').map((x) => x.id)).toEqual(['a', 'b', 'd', 'c']);
    expect(moveRoutineExercise(list, 9, 0).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('distance units from headers, unmapped and bad values', () => {
    expect(detectMapping(['distance_miles']).mapping.distanceUnit).toBe('mi');
    expect(detectMapping(['distance_m']).mapping.distanceUnit).toBe('m');
    const table = parseCsv('a,b,c,d\nx,y,z,w');
    const { rows, issues } = readRows(table, {
      columns: {},
      weightUnit: 'kg',
      distanceUnit: 'km',
      dayFirst: false,
    });
    expect(rows).toEqual([]);
    expect(issues).toEqual([{ line: 2, code: 'missingExercise', column: 'exerciseName' }]);
    const t2 = parseCsv('ex,start,end,dur,sdur\nPlank,2026-01-01 10:00,never,long,ages');
    const r2 = readRows(t2, {
      columns: { exerciseName: 0, startTime: 1, endTime: 2, duration: 3, sessionDuration: 4 },
      weightUnit: 'kg',
      distanceUnit: 'km',
      dayFirst: false,
    });
    expect(r2.rows[0]).toMatchObject({ exerciseName: 'Plank' });
    expect(r2.rows[0]?.end).toBeUndefined();
    expect(r2.rows[0]?.durationSec).toBeUndefined();
    expect(r2.rows[0]?.sessionDurationSec).toBeUndefined();
    const t3 = parseCsv('ex\nPlank');
    expect(
      readRows(t3, {
        columns: { exerciseName: 0 },
        weightUnit: 'kg',
        distanceUnit: 'km',
        dayFirst: false,
      }).issues,
    ).toEqual([{ line: 2, code: 'badDate', column: 'startTime' }]);
  });

  it('sessions at the same time sort by title; routines from sparse workouts', () => {
    const t = parseCsv(
      'title,start,exercise\nB,2026-01-01 10:00,Plank\nA,2026-01-01 10:00,Plank\n,2026-01-02 10:00,Mystery',
    );
    const { mapping } = detectMapping(['title', 'start', 'exercise']);
    const drafts = groupSessions(readRows(t, mapping).rows);
    expect(drafts.map((d) => d.title)).toEqual(['A', 'B', '']);
    const routine = routineFromImport(
      assertDefined(drafts[2], 'draft'),
      { Mystery: 'custom:m' },
      ids(),
      0,
    );
    expect(routine.name).toBe('2026-01-02 10:00');
    expect(routine.exercises[0]?.target).toEqual({ kind: 'reps', min: 8, max: 12 });
  });

  it('remembered names keep the equipment hint', () => {
    const m = createMatcher([{ id: 'x', names: ['X'], equipment: ['machine'] }], {
      [normaliseName('Sled (Machine)').compact]: 'x',
    });
    expect(m.match('Sled (Machine)')).toMatchObject({
      status: 'matched',
      equipmentHint: 'machine',
    });
  });

  it('library records with an illustration; custom exercises with every text field', () => {
    expect(
      parseExerciseRecords([
        {
          id: 'x',
          pattern: 'squat',
          primary: ['quads'],
          equipment: ['machine'],
          legLoad: 'light',
          tracking: 'reps',
          illustration: 'squat_x',
        },
      ])[0]?.illustration,
    ).toBe('squat_x');
    const r = validateCustomExercise({
      id: 'c',
      name: 'C',
      pattern: 'mobility',
      equipment: ['bodyweight'],
      legLoad: 'none',
      aliases: [' c2 '],
      mistakes: ['rushing'],
      basedOn: 'hips_90_90',
    });
    expect(r).toMatchObject({
      ok: true,
      value: {
        aliases: ['c2'],
        mistakes: ['rushing'],
        basedOn: 'hips_90_90',
        trackingMode: 'time',
      },
    });
    expect(SET_TYPES).toContain(parseSetType('dropset', undefined));
  });
});
