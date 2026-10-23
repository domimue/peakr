import { describe, expect, it } from 'vitest';

import { exercises, type CustomExercise } from '../plan/library';
import {
  STRAVA_EXERCISE_MAP,
  STRAVA_EXERCISE_TYPES,
  STRAVA_FALLBACK_TYPE,
  stravaExerciseType,
} from './strava-exercises';
import { buildStravaUpload } from './strava-upload';
import type { GymSession, GymSet } from './types';

const session: GymSession = {
  id: 's1',
  date: '2026-10-21',
  startedAt: Date.UTC(2026, 9, 21, 17, 0),
  endedAt: Date.UTC(2026, 9, 21, 17, 50),
  title: 'Push day',
  kind: 'detailed',
  source: 'app',
};

function set(partial: Partial<GymSet>): GymSet {
  return {
    id: 'x',
    sessionId: 's1',
    exerciseId: 'bench_press',
    setIndex: 0,
    setType: 'working',
    completed: true,
    loggedAt: session.startedAt,
    ...partial,
  };
}

describe('Strava exercise map', () => {
  it('has a row for every library exercise', () => {
    const missing = exercises.map((e) => e.id).filter((id) => !(id in STRAVA_EXERCISE_MAP));
    expect(missing).toEqual([]);
  });

  it('only uses documented Strava types', () => {
    const known = new Set<string>(STRAVA_EXERCISE_TYPES);
    const unknown = Object.values(STRAVA_EXERCISE_MAP).filter((t) => !known.has(t));
    expect(unknown).toEqual([]);
  });

  it('falls back to the pattern, then to a generic entry', () => {
    expect(stravaExerciseType('custom:a', { pattern: 'core', basedOn: undefined })).toEqual({
      type: 'CORE_GENERIC',
      quality: 'pattern',
    });
    expect(stravaExerciseType('custom:b', { pattern: 'other', basedOn: undefined })).toEqual({
      type: STRAVA_FALLBACK_TYPE,
      quality: 'generic',
    });
    expect(
      stravaExerciseType('custom:c', { pattern: 'other', basedOn: 'back_squat' }).quality,
    ).toBe('exact');
    expect(stravaExerciseType('unknown').quality).toBe('generic');
  });
});

describe('buildStravaUpload', () => {
  const ctx = { utcOffsetSec: 7200, calories: 312.4 };

  it('builds the documented JSON shape', () => {
    const upload = buildStravaUpload(
      session,
      [
        set({ setIndex: 0, reps: 10, weightKg: 60 }),
        set({ setIndex: 1, exerciseId: 'plank', durationSec: 60 }),
      ],
      ctx,
      { structuredAvailable: true },
    );
    expect(upload.format).toBe('structured');
    if (upload.format !== 'structured') return;
    expect(upload.payload).toEqual({
      version: '1.0',
      start_time: '2026-10-21T17:00:00.000Z',
      utc_offset: 7200,
      elapsed_time: 3000,
      total_calories: 312,
      creator: { name: 'Peakr' },
      sets: [
        { exercise_type: 'BARBELL_BENCH_PRESS', repetitions: 10, weight: 60 },
        { exercise_type: 'PLANK_HOLD', duration: 60 },
      ],
    });
  });

  it('never drops completed sets, reports generic matches and skipped sets', () => {
    const upload = buildStravaUpload(
      session,
      [
        set({ setIndex: 0, exerciseId: 'custom:zz', reps: 8 }),
        set({ setIndex: 1, setType: 'warmup', reps: 5, weightKg: 20 }),
        set({ setIndex: 2, completed: false, reps: 5 }),
      ],
      ctx,
      { structuredAvailable: true },
    );
    expect(upload.report.sent).toBe(2);
    expect(upload.report.skippedIncomplete).toBe(1);
    expect(upload.report.generic).toEqual([
      { exerciseId: 'custom:zz', type: STRAVA_FALLBACK_TYPE, sets: 1 },
    ]);
    if (upload.format === 'structured') expect(upload.payload.sets).toHaveLength(2);
  });

  it('builds the plain version when the structured format is unavailable or there are no sets', () => {
    const sets = [set({ reps: 10, weightKg: 60 }), set({ setIndex: 1, reps: 8, weightKg: 65 })];
    const plain = buildStravaUpload(session, sets, ctx, { structuredAvailable: false });
    expect(plain.format).toBe('plain');
    if (plain.format !== 'plain') return;
    expect(plain.reason).toBe('unavailable');
    expect(plain.description).toBe('bench_press: 10 × 60 kg, 8 × 65 kg');
    const quick = buildStravaUpload(session, [], ctx, { structuredAvailable: true });
    expect(quick.format === 'plain' && quick.reason).toBe('no_sets');
  });

  it('maps a custom exercise through the library exercise it was copied from', () => {
    const custom = {
      id: 'custom:squat2',
      pattern: 'squat',
      basedOn: 'back_squat',
    } as unknown as CustomExercise;
    const upload = buildStravaUpload(
      session,
      [set({ exerciseId: 'custom:squat2', reps: 5, weightKg: 100 })],
      { ...ctx, custom: [custom] },
      { structuredAvailable: true },
    );
    expect(upload.report.generic).toEqual([]);
    expect(upload.format === 'structured' && upload.payload.sets[0]?.exercise_type).toBe(
      'BARBELL_BACK_SQUAT',
    );
  });

  it('writes a readable summary for every kind of set, with the exercise names', () => {
    const upload = buildStravaUpload(
      { ...session, sessionRpe: 8 },
      [
        set({ setIndex: 0, exerciseId: 'plank', durationSec: 45 }),
        set({ setIndex: 1, exerciseId: 'push_up', reps: 12 }),
        set({ setIndex: 2, exerciseId: 'push_up', reps: 10 }),
        set({ setIndex: 3, exerciseId: 'dips' }),
      ],
      { ...ctx, exerciseName: (id) => id.toUpperCase(), name: 'Home session' },
      { structuredAvailable: false },
    );
    expect(upload.name).toBe('Home session');
    if (upload.format !== 'plain') throw new Error('expected plain');
    expect(upload.description).toBe('PLANK: 45 s\nPUSH_UP: 12 reps, 10 reps\nDIPS: 1 set');
  });

  it('puts the session effort into the summary of a quick log, and skips empty energy', () => {
    const quick = buildStravaUpload(
      { ...session, sessionRpe: 7 },
      [],
      { utcOffsetSec: 0 },
      {
        structuredAvailable: true,
      },
    );
    expect(quick.format === 'plain' && quick.description).toBe('RPE 7');
    const none = buildStravaUpload(
      session,
      [set({ reps: 5 })],
      { utcOffsetSec: 0 },
      {
        structuredAvailable: true,
      },
    );
    expect(none.format === 'structured' && 'total_calories' in none.payload).toBe(false);
  });
});
