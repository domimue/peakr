import type { Workout } from '@peakr/engine';

import { remoteWins, resolvePlan, resolveWorkouts } from '../merge';
import type { SyncPlan, SyncWorkout } from '../types';

function plan(id: string, updatedAt: number, deleted = false): SyncPlan {
  return {
    id,
    input: {} as SyncPlan['input'],
    goal: {} as SyncPlan['goal'],
    startDate: '2026-10-19',
    targetDate: null,
    notes: [],
    weeks: [],
    pauses: [],
    revision: 0,
    deleted,
    createdAt: 0,
    updatedAt,
  };
}

function workout(id: string, updatedAt: number, extra: Partial<SyncWorkout> = {}): SyncWorkout {
  return {
    planId: 'p1',
    id,
    date: '2026-10-20',
    status: 'planned',
    data: { id } as Workout,
    deleted: false,
    updatedAt,
    ...extra,
  };
}

describe('remoteWins', () => {
  it('takes the remote row when there is no local one or it is newer', () => {
    expect(remoteWins(undefined, 1)).toBe(true);
    expect(remoteWins(1, 2)).toBe(true);
  });

  it('keeps the local row when it is newer or the same version', () => {
    expect(remoteWins(2, 1)).toBe(false);
    expect(remoteWins(2, 2)).toBe(false);
  });
});

describe('resolveWorkouts – last write wins per workout', () => {
  const local = new Map([
    ['a', 100],
    ['b', 300],
    ['c', 100],
  ]);

  it('applies newer remote edits and keeps newer local ones', () => {
    const result = resolveWorkouts('p1', local, [
      workout('a', 200, { status: 'done' }),
      workout('b', 200, { status: 'skipped' }),
    ]);
    expect(result.upserts.map((w) => w.id)).toEqual(['a']);
    expect(result.deletes).toEqual([]);
  });

  it('decides each workout on its own', () => {
    const result = resolveWorkouts('p1', local, [workout('a', 50), workout('c', 150)]);
    expect(result.upserts.map((w) => w.id)).toEqual(['c']);
  });

  it('applies newer remote deletions and ignores deletions of unknown rows', () => {
    const result = resolveWorkouts('p1', local, [
      workout('c', 200, { deleted: true }),
      workout('z', 200, { deleted: true }),
    ]);
    expect(result.deletes).toEqual(['c']);
    expect(result.upserts).toEqual([]);
  });

  it('a newer local deletion (tombstone) beats an older remote edit', () => {
    const withTombstone = new Map([['d', 500]]);
    const result = resolveWorkouts('p1', withTombstone, [workout('d', 400)]);
    expect(result.upserts).toEqual([]);
  });

  it('a newer remote edit brings a locally deleted workout back', () => {
    const withTombstone = new Map([['d', 500]]);
    const result = resolveWorkouts('p1', withTombstone, [workout('d', 600)]);
    expect(result.upserts.map((w) => w.id)).toEqual(['d']);
  });

  it('adds new remote workouts and ignores other plans', () => {
    const result = resolveWorkouts('p1', local, [
      workout('new', 1),
      workout('x', 999, { planId: 'p2' }),
    ]);
    expect(result.upserts.map((w) => w.id)).toEqual(['new']);
  });

  it('uses the newest copy when a row arrives twice', () => {
    const result = resolveWorkouts('p1', local, [
      workout('a', 400, { status: 'done' }),
      workout('a', 200, { status: 'skipped' }),
    ]);
    expect(result.upserts).toHaveLength(1);
    expect(result.upserts[0]?.status).toBe('done');
  });
});

describe('resolvePlan', () => {
  const none = new Map<string, number>();

  it('does nothing without server changes or when the local plan is newer', () => {
    expect(resolvePlan({ id: 'p1', updatedAt: 10 }, none, [])).toEqual({ kind: 'none' });
    expect(resolvePlan({ id: 'p1', updatedAt: 10 }, none, [plan('p1', 5)])).toEqual({
      kind: 'none',
    });
  });

  it('updates the local plan with a newer server version', () => {
    const remote = plan('p1', 20);
    expect(resolvePlan({ id: 'p1', updatedAt: 10 }, none, [remote])).toEqual({
      kind: 'update',
      plan: remote,
    });
  });

  it('adopts the server plan on a device without a plan', () => {
    const remote = plan('p2', 5);
    expect(resolvePlan(null, none, [remote])).toEqual({ kind: 'adopt', plan: remote });
  });

  it('adopts a newer plan from another device, but not an older one', () => {
    const newer = plan('p2', 20);
    expect(resolvePlan({ id: 'p1', updatedAt: 10 }, none, [newer])).toEqual({
      kind: 'adopt',
      plan: newer,
    });
    expect(resolvePlan({ id: 'p1', updatedAt: 30 }, none, [newer])).toEqual({ kind: 'none' });
  });

  it('takes the most recent of several plans', () => {
    const a = plan('p2', 20);
    const b = plan('p3', 40);
    expect(resolvePlan({ id: 'p1', updatedAt: 10 }, none, [b, a])).toEqual({
      kind: 'adopt',
      plan: b,
    });
  });

  it('deletes the local plan when it was deleted elsewhere – deletion is final', () => {
    expect(resolvePlan({ id: 'p1', updatedAt: 50 }, none, [plan('p1', 20, true)])).toEqual({
      kind: 'delete',
      planId: 'p1',
    });
  });

  it('never adopts a plan deleted on this device or on the server', () => {
    const tombstones = new Map([['p2', 10]]);
    expect(resolvePlan(null, tombstones, [plan('p2', 20)])).toEqual({ kind: 'none' });
    expect(resolvePlan(null, none, [plan('p3', 20, true)])).toEqual({ kind: 'none' });
  });
});
