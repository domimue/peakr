import { describe, expect, it } from 'vitest';

import {
  afterSet,
  createLiveSession,
  effectiveValues,
  liveProgress,
  liveReducer,
  toGymSession,
  type LiveExerciseInput,
  type LiveSession,
} from './live-session';
import { DEFAULT_PLATE_SETUP, platesPerSide } from './plates';
import { exerciseRecords, findNewRecords } from './records';
import {
  extendRest,
  isRestFinished,
  remainingSec,
  restProgress,
  startRest,
  MAX_REST_SEC,
} from './rest-timer';
import { elapsedSec, LIVE_SESSION_VERSION, restoreLive, serializeLive } from './restore';
import {
  exerciseTimeline,
  gymHistoryByMonth,
  muscleSetTarget,
  muscleShades,
  recentWeeks,
  trainingFrequency,
  weeklyStats,
  weekStartOf,
} from './stats';
import type { GymSession, GymSet } from './types';

const T0 = Date.UTC(2026, 9, 21, 17, 0);
const sec = (n: number) => n * 1000;

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

const input = (over: Partial<LiveExerciseInput> & Pick<LiveExerciseInput, 'entryId'>) =>
  ({
    exerciseId: 'bench_press',
    prescription: '8–12',
    timed: false,
    restSec: 90,
    sets: [
      { weightKg: 80, reps: 8 },
      { weightKg: 80, reps: 8 },
    ],
    previous: [{ exerciseId: 'bench_press', weightKg: 77.5, reps: 8 }],
    ...over,
  }) satisfies LiveExerciseInput;

function live(exercises: LiveExerciseInput[] = [input({ entryId: 'a' })]): LiveSession {
  return createLiveSession(
    { id: 'live1', title: 'Push', date: '2026-10-21', startedAt: T0 },
    exercises,
    ids(),
  );
}

const setId = (s: LiveSession, entryId: string, i: number) =>
  s.exercises.find((e) => e.entryId === entryId)?.sets[i]?.id as string;

describe('rest timer', () => {
  it('counts down from timestamps, so background time and restarts are right', () => {
    const t = startRest('a', 90, T0);
    expect(t).not.toBeNull();
    if (!t) return;
    expect(remainingSec(t, T0)).toBe(90);
    expect(remainingSec(t, T0 + 500)).toBe(90);
    expect(remainingSec(t, T0 + sec(30))).toBe(60);
    // 5 minutes in the background: finished, never negative.
    expect(remainingSec(t, T0 + sec(300))).toBe(0);
    expect(isRestFinished(t, T0 + sec(89))).toBe(false);
    expect(isRestFinished(t, T0 + sec(90))).toBe(true);
    expect(restProgress(t, T0 + sec(45))).toBe(0.5);
    expect(restProgress(t, T0 + sec(200))).toBe(1);
  });

  it('+15 s extends, a finished timer restarts from now, removing too much ends it', () => {
    const t = startRest('a', 60, T0) as NonNullable<ReturnType<typeof startRest>>;
    expect(remainingSec(extendRest(t, 15, T0 + sec(10)) as typeof t, T0 + sec(10))).toBe(65);
    const late = extendRest(t, 15, T0 + sec(120)) as typeof t;
    expect(remainingSec(late, T0 + sec(120))).toBe(15);
    expect(extendRest(t, -60, T0 + sec(10))).toBeNull();
    expect(remainingSec(extendRest(t, -15, T0) as typeof t, T0)).toBe(45);
  });

  it('no rest for 0 s, and at most 15 minutes', () => {
    expect(startRest('a', 0, T0)).toBeNull();
    const t = startRest('a', 3600, T0) as NonNullable<ReturnType<typeof startRest>>;
    expect(remainingSec(t, T0)).toBe(MAX_REST_SEC);
    expect(remainingSec(extendRest(t, 600, T0) as typeof t, T0)).toBe(MAX_REST_SEC);
  });
});

describe('live session', () => {
  it('starts with pre-filled targets, last time as the value to beat, focus on the first set', () => {
    const s = live();
    const e = s.exercises[0];
    expect(e?.sets).toHaveLength(2);
    expect(e?.sets[0]?.target).toEqual({ weightKg: 80, reps: 8 });
    expect(e?.sets[0]?.previous).toEqual({ exerciseId: 'bench_press', weightKg: 77.5, reps: 8 });
    expect(e?.sets[1]?.previous).toBeUndefined();
    expect(s.focus).toEqual({ entryId: 'a', setId: setId(s, 'a', 0) });
    expect(s.rest).toBeNull();
  });

  it('completing a set takes the typed values, else the target, and starts the rest', () => {
    let s = live();
    s = liveReducer(
      s,
      { type: 'updateSet', entryId: 'a', setId: setId(s, 'a', 0), patch: { reps: 10 } },
      T0,
    );
    s = liveReducer(
      s,
      { type: 'completeSet', entryId: 'a', setId: setId(s, 'a', 0) },
      T0 + sec(60),
    );
    const done = s.exercises[0]?.sets[0];
    expect(done).toMatchObject({
      completed: true,
      completedAt: T0 + sec(60),
      reps: 10,
      weightKg: 80,
    });
    expect(s.rest).toEqual({ startedAt: T0 + sec(60), endsAt: T0 + sec(150), entryId: 'a' });
    expect(s.focus?.setId).toBe(setId(s, 'a', 1));
    expect(liveProgress(s)).toEqual({ done: 1, total: 2 });
  });

  it('falls back to last time when there is no target', () => {
    expect(
      effectiveValues({
        id: 'x',
        setType: 'working',
        completed: false,
        previous: { exerciseId: 'bench_press', weightKg: 70, reps: 6 },
      }),
    ).toEqual({ weightKg: 70, reps: 6 });
  });

  it('rest time is per exercise; skip and +15 s', () => {
    let s = live();
    s = liveReducer(s, { type: 'setRestSec', entryId: 'a', restSec: 120 }, T0);
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: setId(s, 'a', 0) }, T0);
    expect(s.rest?.endsAt).toBe(T0 + sec(120));
    s = liveReducer(s, { type: 'extendRest' }, T0 + sec(10));
    expect(s.rest?.endsAt).toBe(T0 + sec(135));
    s = liveReducer(s, { type: 'skipRest' }, T0 + sec(20));
    expect(s.rest).toBeNull();
    expect(liveReducer(s, { type: 'skipRest' }, T0)).toBe(s);
    expect(liveReducer(s, { type: 'extendRest' }, T0)).toBe(s);
  });

  it('supersets cycle between their exercises and rest after the last one', () => {
    let s = live([
      input({ entryId: 'a', supersetGroup: 'g' }),
      input({ entryId: 'b', exerciseId: 'barbell_row', supersetGroup: 'g', restSec: 120 }),
      input({ entryId: 'c', exerciseId: 'lateral_raise' }),
    ]);
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: setId(s, 'a', 0) }, T0);
    expect(s.rest).toBeNull();
    expect(s.focus).toEqual({ entryId: 'b', setId: setId(s, 'b', 0) });
    s = liveReducer(
      s,
      { type: 'completeSet', entryId: 'b', setId: setId(s, 'b', 0) },
      T0 + sec(30),
    );
    expect(s.rest).toMatchObject({ entryId: 'b', endsAt: T0 + sec(150) });
    expect(s.focus).toEqual({ entryId: 'a', setId: setId(s, 'a', 1) });
    s = liveReducer(
      s,
      { type: 'completeSet', entryId: 'a', setId: setId(s, 'a', 1) },
      T0 + sec(200),
    );
    s = liveReducer(
      s,
      { type: 'completeSet', entryId: 'b', setId: setId(s, 'b', 1) },
      T0 + sec(230),
    );
    // Superset done: on to the next exercise.
    expect(s.focus).toEqual({ entryId: 'c', setId: setId(s, 'c', 0) });
    expect(afterSet(s.exercises, s.exercises[2] as never).rest).toBe(true);
  });

  it('adds and removes sets and exercises, marks warm-up, drop and failure sets', () => {
    let s = live();
    s = liveReducer(
      s,
      { type: 'setSetType', entryId: 'a', setId: setId(s, 'a', 0), setType: 'warmup' },
      T0,
    );
    expect(s.exercises[0]?.sets[0]?.setType).toBe('warmup');
    s = liveReducer(
      s,
      { type: 'updateSet', entryId: 'a', setId: setId(s, 'a', 1), patch: { weightKg: 85 } },
      T0,
    );
    s = liveReducer(s, { type: 'addSet', entryId: 'a', setId: 'new' }, T0);
    const added = s.exercises[0]?.sets[2];
    expect(added).toMatchObject({ id: 'new', setType: 'working', weightKg: 85, completed: false });
    s = liveReducer(s, { type: 'setSetType', entryId: 'a', setId: 'new', setType: 'drop' }, T0);
    s = liveReducer(s, { type: 'addSet', entryId: 'a', setId: 'new2' }, T0);
    expect(s.exercises[0]?.sets[3]?.setType).toBe('drop');
    s = liveReducer(s, { type: 'setSetType', entryId: 'a', setId: 'new2', setType: 'failure' }, T0);
    expect(s.exercises[0]?.sets[3]?.setType).toBe('failure');

    // Removing the focused set moves the focus on.
    s = liveReducer(s, { type: 'focus', focus: { entryId: 'a', setId: 'new2' } }, T0);
    s = liveReducer(s, { type: 'removeSet', entryId: 'a', setId: 'new2' }, T0);
    expect(s.exercises[0]?.sets).toHaveLength(3);
    expect(s.focus?.setId).toBe(setId(s, 'a', 0));

    const extra = createLiveSession(
      { id: 'x', title: '', date: '2026-10-21', startedAt: T0 },
      [input({ entryId: 'b', exerciseId: 'dip' })],
      ids(),
    ).exercises[0];
    s = liveReducer(s, { type: 'addExercise', exercise: extra as never }, T0);
    expect(s.exercises.map((e) => e.entryId)).toEqual(['a', 'b']);
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: setId(s, 'a', 0) }, T0);
    s = liveReducer(s, { type: 'removeExercise', entryId: 'a' }, T0);
    expect(s.rest).toBeNull();
    expect(s.focus?.entryId).toBe('b');
    // Unknown ids change nothing.
    expect(liveReducer(s, { type: 'completeSet', entryId: 'zz', setId: 'zz' }, T0)).toBe(s);
    expect(liveReducer(s, { type: 'setRestSec', entryId: 'zz', restSec: 1 }, T0)).toBe(s);
  });

  it('clears values with an empty patch and reopens a set', () => {
    let s = live();
    const id = setId(s, 'a', 0);
    s = liveReducer(s, { type: 'updateSet', entryId: 'a', setId: id, patch: { weightKg: 60 } }, T0);
    s = liveReducer(
      s,
      { type: 'updateSet', entryId: 'a', setId: id, patch: { weightKg: undefined } },
      T0,
    );
    expect(s.exercises[0]?.sets[0]?.weightKg).toBeUndefined();
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: id }, T0);
    s = liveReducer(s, { type: 'uncompleteSet', entryId: 'a', setId: id }, T0);
    expect(s.exercises[0]?.sets[0]?.completed).toBe(false);
    expect(s.exercises[0]?.sets[0]?.completedAt).toBeUndefined();
  });

  it('finishes into a stored session with completed sets only', () => {
    let s = live([
      input({ entryId: 'a' }),
      input({
        entryId: 'b',
        exerciseId: 'plank',
        timed: true,
        sets: [{ durationSec: 45 }],
        previous: [],
      }),
    ]);
    s = liveReducer(
      s,
      { type: 'setSetType', entryId: 'a', setId: setId(s, 'a', 0), setType: 'warmup' },
      T0,
    );
    s = liveReducer(
      s,
      { type: 'completeSet', entryId: 'a', setId: setId(s, 'a', 0) },
      T0 + sec(60),
    );
    s = liveReducer(
      s,
      { type: 'completeSet', entryId: 'b', setId: setId(s, 'b', 0) },
      T0 + sec(600),
    );
    const { session, sets } = toGymSession(
      { ...s, plannedWorkoutId: 'w1' },
      T0 + sec(3000),
      ids(),
      ' good ',
    );
    expect(session).toMatchObject({
      id: 'live1',
      kind: 'detailed',
      durationMin: 50,
      plannedWorkoutId: 'w1',
      notes: 'good',
      source: 'app',
    });
    expect(sets.map((x) => [x.exerciseId, x.setType, x.setIndex])).toEqual([
      ['bench_press', 'warmup', 0],
      ['plank', 'working', 1],
    ]);
    expect(sets[1]?.durationSec).toBe(45);
    expect(sets[0]?.loggedAt).toBe(T0 + sec(60));
  });
});

describe('session restore', () => {
  it('round-trips and derives the elapsed time from the start', () => {
    let s = live();
    s = liveReducer(
      s,
      { type: 'completeSet', entryId: 'a', setId: setId(s, 'a', 0) },
      T0 + sec(60),
    );
    const restored = restoreLive(serializeLive(s), T0 + sec(100));
    expect(restored?.session).toEqual(s);
    expect(restored?.elapsedSec).toBe(100);
    expect(restored?.stale).toBe(false);
    expect(elapsedSec(s, T0 + sec(61.9))).toBe(61);
  });

  it('drops a rest timer that ran out while the app was closed', () => {
    let s = live();
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: setId(s, 'a', 0) }, T0);
    expect(restoreLive(serializeLive(s), T0 + sec(30))?.session.rest).not.toBeNull();
    expect(restoreLive(serializeLive(s), T0 + sec(91))?.session.rest).toBeNull();
  });

  it('marks a session left open for over a day as stale', () => {
    expect(restoreLive(serializeLive(live()), T0 + 25 * 3600_000)?.stale).toBe(true);
  });

  it('ignores missing, corrupt and unknown data', () => {
    expect(restoreLive(null, T0)).toBeNull();
    expect(restoreLive('', T0)).toBeNull();
    expect(restoreLive('{not json', T0)).toBeNull();
    expect(restoreLive('[]', T0)).toBeNull();
    expect(restoreLive(JSON.stringify({ version: 99, session: live() }), T0)).toBeNull();
    const broken = JSON.parse(serializeLive(live())) as {
      session: { exercises: { sets: { setType: string }[] }[] };
    };
    (broken.session.exercises[0]?.sets[0] as { setType: string }).setType = 'mega';
    expect(restoreLive(JSON.stringify(broken), T0)).toBeNull();
    expect(
      restoreLive(JSON.stringify({ version: LIVE_SESSION_VERSION, session: { id: 'x' } }), T0),
    ).toBeNull();
  });
});

describe('plate calculator', () => {
  it('loads the heaviest plates first, per side', () => {
    expect(platesPerSide(100)).toEqual({
      perSide: [25, 15],
      totalKg: 100,
      missingKg: 0,
      belowBar: false,
    });
    expect(platesPerSide(62.5).perSide).toEqual([20, 1.25]);
    expect(platesPerSide(20).perSide).toEqual([]);
  });

  it('says when the weight cannot be made exactly, and below the bar', () => {
    const r = platesPerSide(101);
    expect(r.totalKg).toBe(100);
    expect(r.missingKg).toBe(1);
    expect(platesPerSide(10)).toMatchObject({ belowBar: true, perSide: [] });
  });

  it('uses the configured bar and only the plates the gym has (in pairs)', () => {
    const setup = {
      barKg: 15,
      plates: [
        { kg: 20, count: 2 },
        { kg: 10, count: 3 },
        { kg: 5, count: 1 },
      ],
    };
    const r = platesPerSide(100, setup);
    expect(r.perSide).toEqual([20, 10]);
    expect(r.totalKg).toBe(75);
    expect(r.missingKg).toBe(25);
    expect(DEFAULT_PLATE_SETUP.barKg).toBe(20);
  });
});

// ---------------------------------------------------------------------------------------------

const session = (id: string, date: string, over: Partial<GymSession> = {}): GymSession => ({
  id,
  date,
  startedAt: Date.parse(`${date}T17:00:00Z`),
  endedAt: Date.parse(`${date}T18:00:00Z`),
  title: 'Gym',
  kind: 'detailed',
  source: 'app',
  ...over,
});

let n = 0;
const set = (sessionId: string, exerciseId: string, over: Partial<GymSet> = {}): GymSet => ({
  id: `s${++n}`,
  sessionId,
  exerciseId,
  setIndex: n,
  setType: 'working',
  completed: true,
  loggedAt: 0,
  ...over,
});

describe('PR detection', () => {
  it('session volume and more reps at a known weight are records too', () => {
    const history = [
      set('old', 'squat', { weightKg: 100, reps: 5 }),
      set('old', 'squat', { weightKg: 100, reps: 5 }),
    ];
    const now = [
      set('new', 'squat', { weightKg: 100, reps: 6 }),
      set('new', 'squat', { weightKg: 100, reps: 5 }),
    ];
    const r = findNewRecords(now, history);
    const byKind = Object.fromEntries(r.map((x) => [x.kind, x]));
    expect(byKind.sessionVolume).toMatchObject({ value: 1100, previous: 1000 });
    expect(byKind.repsAtWeight).toMatchObject({ value: 6, previous: 5, weightKg: 100 });
    // Same weight: no weight record.
    expect(byKind.weight).toBeUndefined();
  });

  it('ties, warm-ups and new weights are no reps-at-weight records', () => {
    const history = [set('old', 'squat', { weightKg: 100, reps: 5 })];
    const r = findNewRecords(
      [
        set('new', 'squat', { weightKg: 100, reps: 5 }),
        set('new', 'squat', { weightKg: 100, reps: 9, setType: 'warmup' }),
        set('new', 'squat', { weightKg: 90, reps: 12 }),
      ],
      history,
    );
    expect(r.map((x) => x.kind)).not.toContain('repsAtWeight');
  });

  it('exercise records: heaviest set, best 1RM, best session volume, reps per weight', () => {
    const sets = [
      set('a', 'bench_press', { weightKg: 80, reps: 10 }),
      set('a', 'bench_press', { weightKg: 80, reps: 9 }),
      set('b', 'bench_press', { weightKg: 100, reps: 1 }),
      set('b', 'bench_press', { weightKg: 120, reps: 1, setType: 'warmup' }),
      set('c', 'bench_press', { weightKg: 100, reps: 2, completed: false }),
    ];
    const r = exerciseRecords('bench_press', sets);
    expect(r.heaviest).toEqual({ weightKg: 100, reps: 1, sessionId: 'b' });
    expect(r.bestOneRm?.value).toBeCloseTo(80 * (1 + 10 / 30), 6);
    expect(r.bestOneRm?.sessionId).toBe('a');
    expect(r.bestSessionVolume).toEqual({ value: 1520, sessionId: 'a' });
    expect(r.repsAtWeight).toEqual([
      { weightKg: 100, reps: 1 },
      { weightKg: 80, reps: 10 },
    ]);
    expect(exerciseRecords('plank', [set('a', 'plank', { durationSec: 60 })]).durationSec).toBe(60);
  });
});

describe('statistics', () => {
  const sessions = [
    session('w1a', '2026-10-12'),
    session('w2a', '2026-10-19'),
    session('w2b', '2026-10-21'),
    session('sep', '2026-09-30'),
  ];
  const sets = [
    set('w1a', 'back_squat', { weightKg: 100, reps: 5 }),
    set('w2a', 'back_squat', { weightKg: 105, reps: 5 }),
    set('w2a', 'back_squat', { weightKg: 60, reps: 5, setType: 'warmup' }),
    set('w2b', 'bench_press', { weightKg: 80, reps: 8 }),
    set('w2b', 'bench_press', { weightKg: 80, reps: 8 }),
    set('sep', 'bench_press', { weightKg: 70, reps: 8 }),
  ];

  it('weeks start on Monday', () => {
    expect(weekStartOf('2026-10-21')).toBe('2026-10-19');
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19');
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19');
    expect(recentWeeks('2026-10-21', 3)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
  });

  it('volume, sets, sessions and muscle sets per week, empty weeks included', () => {
    const weeks = weeklyStats(sessions, sets, recentWeeks('2026-10-21', 3));
    expect(weeks.map((w) => [w.sessions, w.sets, w.volumeKg])).toEqual([
      [0, 0, 0],
      [1, 1, 500],
      [2, 3, 525 + 1280],
    ]);
    expect(weeks[2]?.muscles.chest).toBe(2);
    expect(weeks[2]?.muscles.quads).toBe(1);
    expect(weeks[2]?.durationMin).toBe(120);
    expect(trainingFrequency(weeks)).toBe(1);
    expect(trainingFrequency([])).toBe(0);
  });

  it('shades muscles against their target band', () => {
    const shades = muscleShades({ chest: 5, quads: 12, abs: 25 });
    const by = Object.fromEntries(shades.map((s) => [s.muscle, s]));
    expect(by.chest).toMatchObject({ status: 'below', shade: 0.5 });
    expect(by.quads).toMatchObject({ status: 'within', shade: 1 });
    expect(by.abs?.status).toBe('above');
    expect(by.lats).toMatchObject({ status: 'none', shade: 0 });
    expect(muscleSetTarget('forearms').min).toBeLessThan(muscleSetTarget('chest').min);
  });

  it('history grouped by month with month totals, most recent first', () => {
    const months = gymHistoryByMonth(sessions, sets);
    expect(months.map((m) => [m.month, m.sessions])).toEqual([
      ['2026-10', 3],
      ['2026-09', 1],
    ]);
    expect(months[0]?.entries[0]?.session.id).toBe('w2b');
    expect(months[0]?.volumeKg).toBe(500 + 525 + 1280);
    expect(months[1]?.durationMin).toBe(60);
  });

  it('exercise timeline: best e1RM and heaviest set per session, oldest first', () => {
    const t = exerciseTimeline('bench_press', sessions, sets);
    expect(t.map((p) => p.sessionId)).toEqual(['sep', 'w2b']);
    expect(t[1]).toMatchObject({ heaviestKg: 80, volumeKg: 1280 });
    expect(t[1]?.oneRm).toBeCloseTo(101.3, 1);
    expect(t[1]?.sets).toHaveLength(2);
  });
});

describe('edge cases', () => {
  it('notes, focus null once every set is done', () => {
    let s = live([input({ entryId: 'a', sets: [{ reps: 5 }], previous: [] })]);
    s = liveReducer(s, { type: 'setNotes', notes: 'felt strong' }, T0);
    expect(s.notes).toBe('felt strong');
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: setId(s, 'a', 0) }, T0);
    expect(s.focus).toBeNull();
    expect(toGymSession(s, T0 + sec(30), ids()).session).toMatchObject({
      durationMin: 1,
      notes: 'felt strong',
    });
  });

  it('a degenerate timer counts as done', () => {
    expect(restProgress({ startedAt: T0, endsAt: T0, entryId: 'a' }, T0)).toBe(1);
  });

  it('reps-at-weight shows the heaviest weight with a record', () => {
    const history = [
      set('o', 'squat', { weightKg: 80, reps: 5 }),
      set('o', 'squat', { weightKg: 100, reps: 3 }),
    ];
    const r = findNewRecords(
      [set('x', 'squat', { weightKg: 80, reps: 8 }), set('x', 'squat', { weightKg: 100, reps: 4 })],
      history,
    ).find((x) => x.kind === 'repsAtWeight');
    expect(r).toMatchObject({ weightKg: 100, value: 4 });
  });

  it('rejects a stored session that is not an object, and bad dates', () => {
    expect(
      restoreLive(JSON.stringify({ version: LIVE_SESSION_VERSION, session: 'x' }), T0),
    ).toBeNull();
    expect(() => weekStartOf('2026-13-01')).toThrow();
  });

  it('muscle sets skip warm-ups and unknown exercises; bodyweight timelines have no 1RM', () => {
    const weeks = weeklyStats(
      [session('a', '2026-10-21')],
      [
        set('a', 'bench_press', { weightKg: 80, reps: 5, setType: 'warmup' }),
        set('a', 'no_such_exercise', { reps: 5 }),
        set('a', 'push_up', { reps: 20 }),
      ],
      ['2026-10-19'],
    );
    expect(weeks[0]?.muscles.chest).toBe(1);
    const t = exerciseTimeline(
      'push_up',
      [session('a', '2026-10-21')],
      [set('a', 'push_up', { reps: 20 })],
    );
    expect(t[0]?.oneRm).toBeUndefined();
    expect(t[0]?.heaviestKg).toBeUndefined();
  });
});

describe('more edge cases', () => {
  it('adding to an emptied exercise, and after all sets are done', () => {
    let s = live([input({ entryId: 'a', sets: [{ reps: 5 }], previous: [] })]);
    s = liveReducer(s, { type: 'removeSet', entryId: 'a', setId: setId(s, 'a', 0) }, T0);
    expect(s.focus).toBeNull();
    s = liveReducer(s, { type: 'addSet', entryId: 'a', setId: 'n1' }, T0);
    expect(s.exercises[0]?.sets[0]).toEqual({ id: 'n1', setType: 'working', completed: false });
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: 'n1' }, T0);
    expect(s.focus).toBeNull();
    const extra = live([input({ entryId: 'b', exerciseId: 'dip' })]).exercises[0];
    s = liveReducer(s, { type: 'addExercise', exercise: extra as never }, T0);
    expect(s.focus?.entryId).toBe('b');
  });

  it('removing another exercise keeps the rest timer', () => {
    let s = live([input({ entryId: 'a' }), input({ entryId: 'b', exerciseId: 'dip' })]);
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: setId(s, 'a', 0) }, T0);
    s = liveReducer(s, { type: 'removeExercise', entryId: 'b' }, T0);
    expect(s.rest?.entryId).toBe('a');
    expect(s.focus?.entryId).toBe('a');
  });

  it('stores source ids, no notes when empty, bodyweight without weight', () => {
    let s = live([
      input({
        entryId: 'a',
        exerciseId: 'push_up',
        sets: [{ reps: 15, weightKg: 0 }],
        previous: [],
      }),
    ]);
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: setId(s, 'a', 0) }, T0);
    const set0 = s.exercises[0]?.sets[0];
    // A set restored from an older save without completedAt still gets a time.
    const legacy = {
      ...s,
      exercises: [
        { ...(s.exercises[0] as never as object), sets: [{ ...set0, completedAt: undefined }] },
      ],
    } as LiveSession;
    const { session: stored, sets } = toGymSession(
      { ...legacy, sourceId: 'routine:r1', routineId: 'r1' },
      T0 + sec(600),
      ids(),
    );
    expect(stored).toMatchObject({ sourceId: 'routine:r1', routineId: 'r1' });
    expect(stored.notes).toBeUndefined();
    expect(sets[0]?.weightKg).toBeUndefined();
    expect(sets[0]?.loggedAt).toBe(T0 + sec(600));
  });

  it('exercise records: tie on weight keeps more reps; carries without reps', () => {
    const r = exerciseRecords('back_squat', [
      set('a', 'back_squat', { weightKg: 100, reps: 3 }),
      set('b', 'back_squat', { weightKg: 100, reps: 5 }),
      set('c', 'back_squat', { weightKg: 90, reps: 8 }),
    ]);
    expect(r.heaviest).toEqual({ weightKg: 100, reps: 5, sessionId: 'b' });
    const carry = exerciseRecords('farmer_carry', [
      set('a', 'farmer_carry', { weightKg: 30, distanceM: 40 }),
    ]);
    expect(carry.heaviest).toEqual({ weightKg: 30, sessionId: 'a' });
    expect(carry.distanceM).toBe(40);
  });

  it('sessions without sets count in weeks and the history', () => {
    const empty = [session('e', '2026-10-21')];
    expect(weeklyStats(empty, [], ['2026-10-19'])[0]).toMatchObject({
      sessions: 1,
      sets: 0,
      durationMin: 60,
    });
    expect(gymHistoryByMonth(empty, [])[0]?.entries[0]?.summary.sets).toBe(0);
  });
});

describe('last branches', () => {
  it('RPE is kept from typing to the stored set', () => {
    let s = live([input({ entryId: 'a' })]);
    const id = setId(s, 'a', 0);
    s = liveReducer(s, { type: 'updateSet', entryId: 'a', setId: id, patch: { rpe: 8.5 } }, T0);
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: id }, T0);
    expect(toGymSession(s, T0 + sec(60), ids()).sets[0]?.rpe).toBe(8.5);
  });

  it('bodyweight reps; a weighted set without reps; heaviest without reps then with', () => {
    expect(exerciseRecords('pull_up', [set('a', 'pull_up', { reps: 12 })]).reps).toBe(12);
    const r = exerciseRecords('farmer_carry', [
      set('a', 'farmer_carry', { weightKg: 30, distanceM: 40 }),
      set('b', 'farmer_carry', { weightKg: 30, reps: 2 }),
    ]);
    expect(r.heaviest).toEqual({ weightKg: 30, reps: 2, sessionId: 'b' });
    const carry = [set('c', 'farmer_carry', { weightKg: 30, distanceM: 40 })];
    expect(weeklyStats([session('c', '2026-10-21')], carry, ['2026-10-19'])[0]?.volumeKg).toBe(0);
    expect(exerciseTimeline('farmer_carry', [session('c', '2026-10-21')], carry)[0]).toMatchObject({
      heaviestKg: 30,
      volumeKg: 0,
    });
  });
});

describe('carry-forward and empty sets', () => {
  it('a completed set suggests its values for the open sets without a target', () => {
    let s = live([input({ entryId: 'a', sets: [{}, {}, { reps: 3 }], previous: [] })]);
    const id = (i: number) => setId(s, 'a', i);
    s = liveReducer(
      s,
      { type: 'updateSet', entryId: 'a', setId: id(0), patch: { weightKg: 60, reps: 5 } },
      T0,
    );
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: id(0) }, T0);
    expect(s.exercises[0]?.sets[1]?.target).toEqual({ weightKg: 60, reps: 5 });
    // A set with its own target keeps it.
    expect(s.exercises[0]?.sets[2]?.target).toEqual({ reps: 3 });
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: id(1) }, T0);
    expect(s.exercises[0]?.sets[1]).toMatchObject({ weightKg: 60, reps: 5, completed: true });
  });

  it('a set completed without any value is not stored, and passes nothing on', () => {
    let s = live([input({ entryId: 'a', sets: [{}, {}], previous: [] })]);
    s = liveReducer(s, { type: 'completeSet', entryId: 'a', setId: setId(s, 'a', 0) }, T0);
    expect(s.exercises[0]?.sets[1]?.target).toEqual({});
    expect(toGymSession(s, T0 + sec(60), ids()).sets).toEqual([]);
  });
});
