import { describe, expect, it } from 'vitest';

import {
  decodeWorkoutFit,
  encodeWorkoutFit,
  isWorkoutFit,
} from '../../../supabase/functions/_shared/watch/fit-workout.ts';
import type { WatchWorkout } from '../../../supabase/functions/_shared/watch/model.ts';

const run: WatchWorkout = {
  id: 'w1',
  date: '2026-11-02',
  name: 'Tempo run',
  sport: 'run',
  steps: [
    {
      kind: 'step',
      intensity: 'warmup',
      durationSec: 600,
      target: { type: 'heartRate', lowBpm: 120, highBpm: 140 },
      name: 'Warm-up',
    },
    {
      kind: 'repeat',
      count: 3,
      steps: [
        {
          kind: 'step',
          intensity: 'interval',
          distanceM: 1000,
          target: { type: 'pace', fastestSecPerKm: 285, slowestSecPerKm: 300 },
        },
        { kind: 'step', intensity: 'recovery', durationSec: 90, target: { type: 'open' } },
      ],
    },
  ],
};

describe('workout FIT file', () => {
  it('decodes again with the SDK', () => {
    const bytes = encodeWorkoutFit(run);
    expect(isWorkoutFit(bytes)).toBe(true);
    const decoded = decodeWorkoutFit(bytes);
    console.log(JSON.stringify(decoded, null, 1));
    expect(decoded.errors).toEqual([]);
  });
});
