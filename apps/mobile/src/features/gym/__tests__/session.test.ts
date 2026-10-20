import { getExercise, hasEquipmentFor, equipmentFor } from '@peakr/engine';

import type { StrengthLogEntry } from '@/data/repositories/strength-repository';
import i18n from '@/i18n';

import {
  exerciseHowTo,
  exerciseName,
  lastSetsFor,
  prefillSession,
  routineSession,
  templateSession,
} from '../session';

const entry = (
  date: string,
  createdAt: number,
  sets: StrengthLogEntry['log'],
): StrengthLogEntry => ({
  id: `${date}-${createdAt}`,
  date,
  title: '',
  sourceId: null,
  log: sets,
  createdAt,
});

describe('strength session helpers', () => {
  const logs = [
    entry('2026-10-10', 1, {
      kind: 'detailed',
      durationMin: 40,
      sets: [{ exerciseId: 'goblet_squat', reps: 12, weightKg: 20, rpe: 8 }],
    }),
    entry('2026-10-12', 2, { kind: 'quick', durationMin: 30, rpe: 7, legs: true }),
    entry('2026-10-11', 3, {
      kind: 'detailed',
      durationMin: 40,
      sets: [
        { exerciseId: 'goblet_squat', reps: 12, weightKg: 24, rpe: 8 },
        { exerciseId: 'goblet_squat', reps: 12, weightKg: 24, rpe: 8 },
      ],
    }),
  ];

  it('finds the most recent detailed sets of an exercise', () => {
    expect(lastSetsFor(logs, 'goblet_squat', '2026-10-18')).toEqual({
      sets: [
        { exerciseId: 'goblet_squat', reps: 12, weightKg: 24, rpe: 8 },
        { exerciseId: 'goblet_squat', reps: 12, weightKg: 24, rpe: 8 },
      ],
      daysSince: 7,
    });
    expect(lastSetsFor(logs, 'push_up', '2026-10-18')).toBeNull();
  });

  it('pre-fills a routine from last time (double progression, lower body +5 %)', () => {
    const session = routineSession({
      id: 'r',
      name: 'Legs',
      durationMin: 40,
      exercises: [
        { exerciseId: 'goblet_squat', sets: 2, reps: '8–12' },
        { name: 'Sled push', sets: 1, reps: '20 m', weightKg: 40 },
      ],
    });
    expect(session.sourceId).toBe('routine:r');
    expect(session.exercises[1]).toMatchObject({ exerciseId: 'custom:r:1', name: 'Sled push' });
    const prefill = prefillSession(session, logs, '2026-10-18', []);
    expect(prefill[0]?.sets).toEqual([
      { reps: 8, weightKg: 25 },
      { reps: 8, weightKg: 25 },
    ]);
    expect(prefill[1]?.sets).toEqual([{ weightKg: 40 }]);
  });

  it('adapts library sessions to the equipment', () => {
    const home = templateSession('strength.legs', 'home');
    for (const e of home.exercises) {
      expect(
        hasEquipmentFor(getExercise(e.exerciseId) ?? { equipment: [] }, equipmentFor('home')),
      ).toBe(true);
    }
    expect(templateSession('strength.legs').exercises[0]?.exerciseId).toBe('back_squat');
    expect(() => templateSession('run.easy')).toThrow();
  });

  it('names library, custom and free-text exercises', () => {
    const t = i18n.t.bind(i18n);
    const custom = [
      {
        id: 'custom:sled',
        name: 'Sled push',
        howTo: 'Push.',
        pattern: 'squat' as const,
        muscles: [],
        equipment: ['machine' as const],
        legLoad: 'heavy' as const,
        unilateral: false,
      },
    ];
    expect(exerciseName(t, 'back_squat', custom)).toBe('Back squat');
    expect(exerciseName(t, 'custom:sled', custom)).toBe('Sled push');
    expect(exerciseName(t, 'custom:r:1', custom, 'Farmer walk')).toBe('Farmer walk');
    expect(exerciseHowTo(t, 'custom:sled', custom)).toBe('Push.');
    expect(exerciseHowTo(t, 'plank', custom)).toMatch(/Forearms/);
    expect(exerciseHowTo(t, 'custom:r:1', custom)).toBeUndefined();
  });
});
