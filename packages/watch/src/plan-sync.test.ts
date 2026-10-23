import {
  generatePlan,
  moveWorkout,
  setWorkoutStatus,
  newPlanState,
  allWorkouts,
  type HrZone,
} from '@peakr/engine';
import { describe, expect, it } from 'vitest';

import { grid } from '../../engine/src/plan/fixtures';
import { planSync, workoutHash } from '../../../supabase/functions/_shared/watch/sync.ts';
import { plannedWatchWorkouts } from './plan-sync';

const hrZones: HrZone[] = [
  { zone: 1, minBpm: null, maxBpm: 125 },
  { zone: 2, minBpm: 126, maxBpm: 140 },
  { zone: 3, minBpm: 141, maxBpm: 155 },
  { zone: 4, minBpm: 156, maxBpm: 170 },
  { zone: 5, minBpm: 171, maxBpm: null },
];

function setup() {
  const c = grid()[10];
  if (!c) throw new Error('no case');
  const plan = generatePlan(c.profile, { kind: c.goal }, c.availability, c.start, c.target);
  if (!plan.ok) throw new Error('plan failed');
  return { c, state: newPlanState(plan.value) };
}

describe('keeping a watch in step with the plan', () => {
  it('sends only planned endurance workouts of the next 14 days', () => {
    const { c, state } = setup();
    const today = c.start;
    const out = plannedWatchWorkouts({ state, profile: c.profile, hrZones }, today);
    expect(out.length).toBeGreaterThan(0);
    const limit = Date.parse(`${today}T00:00:00Z`) + 14 * 86_400_000;
    for (const w of out) {
      expect(Date.parse(`${w.date}T00:00:00Z`)).toBeLessThan(limit);
      expect(w.date >= today).toBe(true);
    }
    expect(out.length).toBeLessThanOrEqual(30);
  });

  it('leaves skipped and done workouts out', () => {
    const { c, state } = setup();
    const before = plannedWatchWorkouts({ state, profile: c.profile, hrZones }, c.start);
    const first = allWorkouts(state.plan).find((w) =>
      before.some((b) => b.id.split(':')[0] === w.id),
    );
    if (!first) throw new Error('no workout in the window');
    const skipped = setWorkoutStatus(state, first.id, 'skipped');
    if (!skipped.ok) throw new Error('skip failed');
    const after = plannedWatchWorkouts(
      { state: skipped.value, profile: c.profile, hrZones },
      c.start,
    );
    expect(after.some((w) => w.id.split(':')[0] === first.id)).toBe(false);
    expect(after.length).toBeLessThan(before.length);
  });

  it('a moved workout is an update on the watch, not a duplicate', () => {
    const { c, state } = setup();
    const before = plannedWatchWorkouts({ state, profile: c.profile, hrZones }, c.start);
    const pushed = before.map((w) => ({
      workoutId: w.id,
      externalId: `x-${w.id}`,
      hash: workoutHash(w),
    }));
    // Identical plan: nothing to send.
    expect(planSync(before, pushed).create).toHaveLength(0);
    expect(planSync(before, pushed).update).toHaveLength(0);

    const target = allWorkouts(state.plan).find((w) => before.some((b) => b.id === w.id));
    if (!target) throw new Error('no workout');
    const day = new Date(Date.parse(`${target.date}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const moved = moveWorkout(
      state,
      target.id,
      day,
      { profile: c.profile, goal: { kind: c.goal }, availability: c.availability },
      c.start,
    );
    if (!moved.ok) throw new Error('move failed');
    const after = plannedWatchWorkouts(
      { state: moved.value.state, profile: c.profile, hrZones },
      c.start,
    );
    const sync = planSync(after, pushed);
    expect(sync.update.map((u) => u.previous.workoutId)).toContain(target.id);
    expect(sync.create.some((w) => w.id === target.id)).toBe(false);
  });
});
