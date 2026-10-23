import { generatePlan, type HrZone, type Workout } from '@peakr/engine';
import { describe, expect, it } from 'vitest';

import { grid } from '../../engine/src/plan/fixtures';
import {
  decodeWorkoutFit,
  encodeWorkoutFit,
} from '../../../supabase/functions/_shared/watch/fit-workout.ts';
import { mergeSegments, toWatchWorkouts, type WatchContext } from './from-plan';

const hrZones: HrZone[] = [
  { zone: 1, minBpm: null, maxBpm: 125 },
  { zone: 2, minBpm: 126, maxBpm: 140 },
  { zone: 3, minBpm: 141, maxBpm: 155 },
  { zone: 4, minBpm: 156, maxBpm: 170 },
  { zone: 5, minBpm: 171, maxBpm: null },
];

function workoutsOf(index: number): { workouts: Workout[]; ctx: WatchContext } {
  const c = grid()[index];
  if (!c) throw new Error('no case');
  const plan = generatePlan(c.profile, { kind: c.goal }, c.availability, c.start, c.target);
  if (!plan.ok) throw new Error('plan failed');
  return {
    workouts: plan.value.weeks.slice(0, 6).flatMap((w) => w.workouts),
    ctx: { profile: c.profile, hrZones },
  };
}

describe('plan workouts → watch workouts', () => {
  it('every exportable workout of a spread of plans encodes to a FIT file that decodes again', () => {
    let exported = 0;
    for (let i = 0; i < grid().length; i += 23) {
      const { workouts, ctx } = workoutsOf(i);
      for (const w of workouts) {
        const result = toWatchWorkouts(w, ctx);
        if (!result.ok) continue;
        for (const watch of result.workouts) {
          const decoded = decodeWorkoutFit(encodeWorkoutFit(watch));
          expect(decoded.errors, `${w.id} ${w.templateId}`).toEqual([]);
          expect(decoded.steps.length).toBeGreaterThan(0);
          exported++;
        }
      }
    }
    expect(exported).toBeGreaterThan(40);
  });

  it('keeps strength out of the watch export', () => {
    const { workouts, ctx } = workoutsOf(5);
    const strength = Object.assign({}, workouts[0], { sport: 'strength' as const }) as Workout;
    expect(toWatchWorkouts(strength, ctx)).toEqual({ ok: false, reason: 'strength' });
    const winter = { ...strength, sport: 'xcski' as const };
    expect(toWatchWorkouts(winter, ctx)).toEqual({ ok: false, reason: 'winter' });
    expect(toWatchWorkouts({ ...strength, sport: 'walk' as const }, ctx)).toEqual({
      ok: false,
      reason: 'walk',
    });
  });

  it('prescribes easy runs by heart-rate zone and swims by pace per 100 m with the pool length', () => {
    let sawEasyRun = false;
    let sawSwim = false;
    for (let i = 0; i < grid().length && !(sawEasyRun && sawSwim); i += 7) {
      const { workouts, ctx } = workoutsOf(i);
      for (const w of workouts) {
        const result = toWatchWorkouts(w, ctx);
        if (!result.ok) continue;
        const first = result.workouts[0];
        if (!first) continue;
        if (w.sport === 'run' && w.paceMode === 'limit' && !sawEasyRun) {
          const targets = first.steps.flatMap((n) => (n.kind === 'step' ? [n] : n.steps));
          expect(targets.every((s) => s.target.type === 'heartRate')).toBe(true);
          sawEasyRun = true;
        }
        if (w.sport === 'swim' && first.sport === 'swim' && !sawSwim) {
          const steps = first.steps.flatMap((n) => (n.kind === 'step' ? [n] : n.steps));
          expect(steps.some((s) => s.target.type === 'swimPace')).toBe(true);
          if (ctx.profile.poolLength === 25 || ctx.profile.poolLength === 50) {
            expect(first.poolLengthM).toBe(ctx.profile.poolLength);
          } else {
            expect(first.poolLengthM).toBeUndefined();
          }
          sawSwim = true;
        }
      }
    }
    expect(sawEasyRun).toBe(true);
    expect(sawSwim).toBe(true);
  });

  it('splits a brick into one workout per sport', () => {
    let found = false;
    for (let i = 0; i < grid().length && !found; i += 3) {
      const { workouts, ctx } = workoutsOf(i);
      const brick = workouts.find((w) => w.sport === 'brick');
      if (!brick) continue;
      const result = toWatchWorkouts(brick, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.workouts.length).toBeGreaterThan(1);
        expect(new Set(result.workouts.map((w) => w.sport)).size).toBe(result.workouts.length);
        expect(result.workouts[0]?.id).toBe(`${brick.id}:1`);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('gives a steady run on a route one step per route segment with its pace range', () => {
    let found = false;
    for (let i = 0; i < grid().length && !found; i += 2) {
      const { workouts, ctx } = workoutsOf(i);
      const steady = workouts.find(
        (w) => w.sport === 'run' && w.main.every((b) => b.repeat === 1) && w.paceMode === 'target',
      );
      if (!steady) continue;
      // 6 km that climb in the middle.
      const profile = Array.from({ length: 61 }, (_, k) => ({
        distanceM: k * 100,
        elevationM: 400 + (k > 20 && k < 40 ? (k - 20) * 3 : k >= 40 ? 60 : 0),
      }));
      const result = toWatchWorkouts(steady, { ...ctx, routeProfile: profile });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const names = (result.workouts[0]?.steps ?? []).flatMap((n) =>
        n.kind === 'step' && n.name?.startsWith('km ') ? [n] : [],
      );
      expect(names.length).toBeGreaterThan(1);
      expect(names.every((s) => s.target.type === 'pace' && s.distanceM !== undefined)).toBe(true);
      found = true;
    }
    expect(found).toBe(true);
  });

  it('merges neighbouring segments with the same pace range and caps the step count', () => {
    const seg = (i: number, fastest: number) => ({
      startM: i * 1000,
      endM: (i + 1) * 1000,
      gradient: 0,
      targetSecPerKm: fastest + 5,
      fastestSecPerKm: fastest,
      slowestSecPerKm: fastest + 10,
      pacePrimary: true,
    });
    expect(mergeSegments([seg(0, 300), seg(1, 302), seg(2, 330)])).toHaveLength(2);
    const many = Array.from({ length: 120 }, (_, i) => seg(i, 300 + i * 20));
    expect(mergeSegments(many).length).toBeLessThanOrEqual(40);
    expect(mergeSegments(many).at(-1)?.endM).toBe(120_000);
  });
});
