import {
  equipmentFor,
  getExercise,
  hasEquipmentFor,
  type CustomExercise,
  type GymSession,
  type GymSet,
  type Workout,
} from '@peakr/engine';

import type { GymHistory } from '@/data/repositories/gym-repository';
import i18n from '@/i18n';

import {
  buildDetailedSession,
  buildQuickSession,
  exerciseHowTo,
  exerciseName,
  isTimed,
  lastSetsFor,
  planWorkoutSession,
  prefillSession,
  routineSession,
  templateSession,
} from '../session';

const session = (id: string, date: string, startedAt: number): GymSession => ({
  id,
  date,
  startedAt,
  title: '',
  kind: 'detailed',
  source: 'app',
});
const set = (sessionId: string, setIndex: number, over: Partial<GymSet>): GymSet => ({
  id: `${sessionId}-${setIndex}`,
  sessionId,
  exerciseId: 'goblet_squat',
  setIndex,
  setType: 'working',
  completed: true,
  loggedAt: 0,
  ...over,
});

describe('gym session helpers', () => {
  const history: GymHistory = {
    sessions: [
      session('a', '2026-10-10', 1),
      { ...session('q', '2026-10-12', 3), kind: 'quick', durationMin: 30, legs: true },
      session('b', '2026-10-11', 2),
    ],
    sets: [
      set('a', 0, { reps: 12, weightKg: 20, rpe: 8 }),
      set('b', 0, { reps: 12, weightKg: 24, rpe: 8 }),
      set('b', 1, { reps: 12, weightKg: 24, rpe: 8 }),
      set('b', 2, { reps: 5, weightKg: 10, setType: 'warmup' }),
    ],
  };

  it('finds the most recent working sets of an exercise', () => {
    expect(lastSetsFor(history, 'goblet_squat', '2026-10-18')).toEqual({
      sets: [
        { exerciseId: 'goblet_squat', reps: 12, weightKg: 24, rpe: 8 },
        { exerciseId: 'goblet_squat', reps: 12, weightKg: 24, rpe: 8 },
      ],
      daysSince: 7,
    });
    expect(lastSetsFor(history, 'push_up', '2026-10-18')).toBeNull();
  });

  it('pre-fills a routine from last time (double progression, lower body +5 %)', () => {
    const s = routineSession({
      id: 'r',
      name: 'Legs',
      position: 0,
      exercises: [
        {
          id: 'e1',
          exerciseId: 'goblet_squat',
          targetSets: 2,
          target: { kind: 'reps', min: 8, max: 12 },
          restSec: 90,
          supersetGroup: 'g',
          notes: 'slow',
        },
        {
          id: 'e2',
          exerciseId: 'custom:sled',
          targetSets: 1,
          target: { kind: 'distance', m: 20 },
          restSec: 120,
          weightKg: 40,
        },
      ],
    });
    expect(s).toMatchObject({ sourceId: 'routine:r', routineId: 'r', title: 'Legs' });
    expect(s.durationMin).toBeGreaterThan(0);
    expect(s.exercises[0]).toMatchObject({ reps: '8–12', supersetGroup: 'g', notes: 'slow' });
    expect(s.exercises[1]).toMatchObject({ exerciseId: 'custom:sled', reps: '20 m', weightKg: 40 });
    const prefill = prefillSession(s, history, '2026-10-18', []);
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

  it('keeps the planned workout and its routine', () => {
    const w = {
      id: 'w1',
      templateId: 'routine:r9',
      durationMin: 45,
      exercises: [{ exerciseId: 'plank', sets: 3, reps: '30 s', restSec: 45 }],
    } as unknown as Workout;
    expect(planWorkoutSession(w)).toMatchObject({
      plannedWorkoutId: 'w1',
      routineId: 'r9',
      sourceId: 'routine:r9',
      exercises: [{ exerciseId: 'plank', reps: '30 s' }],
    });
    expect(isTimed('30 s')).toBe(true);
    expect(isTimed('8–12')).toBe(false);
  });

  it('builds detailed and quick sessions', () => {
    const s = {
      ...routineSession({ id: 'r', name: 'Push', position: 0, exercises: [] }),
      plannedWorkoutId: 'w',
    };
    const built = buildDetailedSession(
      s,
      [
        { exerciseId: 'bench_press', weightKg: 60, reps: 8, rpe: 7 },
        { exerciseId: 'plank', durationSec: 45 },
      ],
      { date: '2026-10-20', startedAt: 1000, endedAt: 61000, durationMin: 1 },
    );
    expect(built.session).toMatchObject({
      date: '2026-10-20',
      kind: 'detailed',
      routineId: 'r',
      plannedWorkoutId: 'w',
      sourceId: 'routine:r',
      title: 'Push',
    });
    expect(
      built.sets.map((x) => [x.setIndex, x.sessionId === built.session.id, x.reps, x.durationSec]),
    ).toEqual([
      [0, true, 8, undefined],
      [1, true, undefined, 45],
    ]);
    const quick = buildQuickSession({
      date: '2026-10-20',
      now: 3_600_000,
      durationMin: 30,
      rpe: 6,
      legs: true,
    });
    expect(quick).toMatchObject({ kind: 'quick', startedAt: 1_800_000, sessionRpe: 6, legs: true });
  });

  it('names library, custom and free-text exercises', () => {
    const t = i18n.t.bind(i18n);
    const custom: CustomExercise[] = [
      {
        id: 'custom:sled',
        name: 'Sled push',
        instructions: 'Push.',
        pattern: 'squat',
        primaryMuscles: [],
        secondaryMuscles: [],
        muscles: [],
        equipment: ['machine'],
        legLoad: 'heavy',
        unilateral: false,
        trackingMode: 'distance',
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
