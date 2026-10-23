import { describe, expect, it } from 'vitest';

import { route, workout, workouts } from '../../../supabase/functions/_shared/watch/validate.ts';

const good = {
  id: 'w1',
  date: '2026-11-02',
  name: 'Easy run',
  sport: 'run',
  steps: [
    { kind: 'step', intensity: 'warmup', durationSec: 300, target: { type: 'open' } },
    {
      kind: 'repeat',
      count: 3,
      steps: [
        {
          kind: 'step',
          intensity: 'interval',
          distanceM: 400,
          target: { type: 'pace', fastestSecPerKm: 240, slowestSecPerKm: 250 },
        },
      ],
    },
  ],
};

describe('watch payload validation', () => {
  it('accepts a well-formed workout and drops unknown fields', () => {
    const parsed = workout({ ...good, evil: 'x', steps: good.steps });
    expect(parsed).toMatchObject({ id: 'w1', sport: 'run' });
    expect(parsed).not.toHaveProperty('evil');
  });

  it.each([
    ['unknown sport', { ...good, sport: 'golf' }],
    ['bad date', { ...good, date: '02.11.2026' }],
    ['no steps', { ...good, steps: 'x' }],
    ['negative duration', { ...good, steps: [{ kind: 'step', intensity: 'active', durationSec: -5, target: { type: 'open' } }] }],
    ['unknown intensity', { ...good, steps: [{ kind: 'step', intensity: 'sprint', target: { type: 'open' } }] }],
    ['inverted heart-rate range', { ...good, steps: [{ kind: 'step', intensity: 'active', target: { type: 'heartRate', lowBpm: 160, highBpm: 120 } }] }],
    ['inverted pace range', { ...good, steps: [{ kind: 'step', intensity: 'active', target: { type: 'pace', fastestSecPerKm: 400, slowestSecPerKm: 300 } }] }],
    ['inverted swim pace', { ...good, steps: [{ kind: 'step', intensity: 'active', target: { type: 'swimPace', fastestSecPer100m: 120, slowestSecPer100m: 90 } }] }],
    ['unknown target', { ...good, steps: [{ kind: 'step', intensity: 'active', target: { type: 'power' } }] }],
    ['empty repeat', { ...good, steps: [{ kind: 'repeat', count: 2, steps: [] }] }],
    ['not an object', 'x'],
  ])('rejects %s', (_name, value) => {
    expect(workout(value)).toBeNull();
  });

  it('keeps the pool length only when it is 25 or 50', () => {
    const swim = { ...good, sport: 'swim', steps: [] };
    expect(workout({ ...swim, poolLengthM: 50 })).toMatchObject({ poolLengthM: 50 });
    expect(workout({ ...swim, poolLengthM: 33 })).not.toHaveProperty('poolLengthM');
  });

  it('limits the number of steps and workouts', () => {
    const many = Array.from({ length: 61 }, () => good.steps[0]);
    expect(workout({ ...good, steps: many })).toBeNull();
    expect(workouts(Array.from({ length: 61 }, () => good))).toBeNull();
    expect(workouts([good, good])).toHaveLength(2);
    expect(workouts([good, { nope: 1 }])).toBeNull();
    expect(workouts('x')).toBeNull();
  });

  it('validates routes: coordinates in range, elevation optional, size limited', () => {
    const r = { id: 'r', name: 'Loop', sport: 'bike', points: [{ lat: 47, lon: 8, ele: 400 }, { lat: 47.1, lon: 8.1 }] };
    expect(route(r)).toMatchObject({ sport: 'bike' });
    expect(route(r)?.points[1]?.ele).toBeNull();
    expect(route({ ...r, points: [{ lat: 95, lon: 8 }, { lat: 47, lon: 8 }] })).toBeNull();
    expect(route({ ...r, points: [{ lat: 47, lon: 8, ele: 'x' }, { lat: 47, lon: 8 }] })).toBeNull();
    expect(route({ ...r, points: [{ lat: 47, lon: 8 }] })).toBeNull();
    expect(route({ ...r, sport: 'swim' })).toBeNull();
    expect(route({ ...r, points: Array.from({ length: 6001 }, () => ({ lat: 1, lon: 1 })) })).toBeNull();
    expect(route({ ...r, points: [null, null] })).toBeNull();
    expect(route(null)).toBeNull();
  });
});
