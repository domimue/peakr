import type { LegacyCustomExercise, LegacyStrengthLog, Routine } from '@peakr/engine';

import { GYM_MIGRATION_KEY, migrateGymData } from '../gym-migration';
import {
  appSettings,
  customExercises,
  gymExercises,
  gymRoutines,
  gymSessions,
  gymSets,
  routines,
  strengthLogs,
} from '../schema';

/**
 * A minimal in-memory stand-in for the Drizzle transaction API the migration uses (Jest has no
 * SQLite). Rows are kept per table object.
 */
const mockTables = new Map<object, Record<string, unknown>[]>();

jest.mock('../client', () => {
  const rowsOf = (table: object) => mockTables.get(table) ?? [];
  const tx = {
    select: () => ({
      from: (table: object) => {
        const query = {
          where: () => ({ get: () => rowsOf(table)[0] }),
          orderBy: () => query,
          all: () => [...rowsOf(table)],
        };
        return query;
      },
    }),
    insert: (table: object) => ({
      values: (value: Record<string, unknown> | Record<string, unknown>[]) => {
        const add = () => mockTables.set(table, [...rowsOf(table), ...[value].flat()]);
        return {
          run: add,
          onConflictDoUpdate: () => ({ run: add }),
          onConflictDoNothing: () => ({ run: add }),
        };
      },
    }),
  };
  return { db: { transaction: (fn: (t: typeof tx) => void) => fn(tx) } };
});

const legacyRoutine: Routine = {
  id: 'r1',
  name: 'Legs',
  durationMin: 50,
  exercises: [
    { exerciseId: 'back_squat', sets: 4, reps: '5', weightKg: 100 },
    { name: 'Belt squat', sets: 3, reps: '10', legLoad: 'heavy' },
  ],
};
const legacyCustom: LegacyCustomExercise = {
  id: 'custom:sled',
  name: 'Sled push',
  pattern: 'squat',
  muscles: [],
  equipment: ['machine'],
  legLoad: 'heavy',
};
const legacyLogs: LegacyStrengthLog[] = [
  {
    id: 'l1',
    date: '2026-09-01',
    title: 'Legs',
    sourceId: 'routine:r1',
    createdAt: 10_000_000,
    log: {
      kind: 'detailed',
      durationMin: 50,
      sets: [
        { exerciseId: 'back_squat', weightKg: 100, reps: 5 },
        { exerciseId: 'custom:r1:1', reps: 10 },
      ],
    },
  },
  {
    id: 'l2',
    date: '2026-09-02',
    title: '',
    sourceId: null,
    createdAt: 20_000_000,
    log: { kind: 'quick', durationMin: 30, rpe: 6, legs: false },
  },
];

beforeEach(() => {
  mockTables.clear();
  mockTables.set(routines, [{ ...legacyRoutine, updatedAt: 1 }]);
  mockTables.set(customExercises, [{ id: legacyCustom.id, data: legacyCustom, createdAt: 1 }]);
  mockTables.set(
    strengthLogs,
    legacyLogs.map((l) => ({ ...l })),
  );
});

describe('Phase 3 → gym data migration', () => {
  it('copies routines, custom exercises, logs and sets, and marks itself done', () => {
    migrateGymData();
    expect(mockTables.get(gymRoutines)?.map((r) => [r.id, r.name, r.durationMin])).toEqual([
      ['r1', 'Legs', 50],
    ]);
    expect(mockTables.get(gymExercises)?.map((e) => e.id)).toEqual(['custom:sled', 'custom:r1:1']);
    expect(mockTables.get(gymSessions)?.map((s) => [s.id, s.kind, s.source])).toEqual([
      ['l1', 'detailed', 'migrated'],
      ['l2', 'quick', 'migrated'],
    ]);
    expect(
      mockTables.get(gymSets)?.map((s) => [s.exerciseId, s.setIndex, s.weightKg, s.reps]),
    ).toEqual([
      ['back_squat', 0, 100, 5],
      ['custom:r1:1', 1, null, 10],
    ]);
    expect(mockTables.get(appSettings)?.[0]?.key).toBe(GYM_MIGRATION_KEY);
    // The old tables stay as they were.
    expect(mockTables.get(strengthLogs)).toHaveLength(2);
  });

  it('runs only once', () => {
    migrateGymData();
    migrateGymData();
    expect(mockTables.get(gymSessions)).toHaveLength(2);
    expect(mockTables.get(gymSets)).toHaveLength(2);
  });
});
