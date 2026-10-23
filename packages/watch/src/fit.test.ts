import { describe, expect, it } from 'vitest';

import {
  decodeWorkoutFit,
  encodeWorkoutFit,
  isWorkoutFit,
} from '../../../supabase/functions/_shared/watch/fit-workout.ts';
import { routeToGpx } from '../../../supabase/functions/_shared/watch/gpx-course.ts';
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
    { kind: 'step', intensity: 'cooldown', target: { type: 'open' }, name: 'Cool-down' },
  ],
};

describe('workout FIT file (decodes again with the official SDK)', () => {
  const decoded = decodeWorkoutFit(encodeWorkoutFit(run));

  it('is a valid FIT file without decoding errors', () => {
    expect(isWorkoutFit(encodeWorkoutFit(run))).toBe(true);
    expect(decoded.errors).toEqual([]);
    expect(decoded.name).toBe('Tempo run');
    expect(decoded.sport).toBe('running');
  });

  it('keeps time and distance durations and open steps', () => {
    const [warmup, interval, recovery, , cooldown] = decoded.steps;
    expect(warmup).toMatchObject({ intensity: 'warmup', durationType: 'time', durationTime: 600 });
    expect(interval).toMatchObject({ durationType: 'distance', durationDistance: 1000 });
    expect(recovery).toMatchObject({ intensity: 'recovery', durationType: 'time', durationTime: 90 });
    expect(cooldown).toMatchObject({ durationType: 'open', targetType: 'open' });
    expect(decoded.steps).toHaveLength(5);
  });

  it('writes a heart-rate range as bpm + 100 and a pace range as speed', () => {
    const [warmup, interval] = decoded.steps;
    expect(warmup).toMatchObject({
      targetType: 'heartRate',
      customTargetValueLow: 220,
      customTargetValueHigh: 240,
    });
    // 5:00 /km = 3.333 m/s is the slow end, 4:45 /km = 3.509 m/s the fast end.
    expect(interval).toMatchObject({ targetType: 'speed' });
    expect(interval?.customTargetSpeedLow).toBeCloseTo(3.333, 2);
    expect(interval?.customTargetSpeedHigh).toBeCloseTo(3.509, 2);
  });

  it('writes a repeat as a step pointing back at the first repeated step', () => {
    const repeat = decoded.steps[3];
    expect(repeat).toMatchObject({
      durationType: 'repeatUntilStepsCmplt',
      durationStep: 1,
      repeatSteps: 3,
    });
  });

  it('writes a swim with pool length and pace targets', () => {
    const swim: WatchWorkout = {
      id: 'swim1',
      date: '2026-11-03',
      name: 'CSS set',
      sport: 'swim',
      poolLengthM: 25,
      steps: [
        {
          kind: 'repeat',
          count: 8,
          steps: [
            {
              kind: 'step',
              intensity: 'interval',
              distanceM: 100,
              target: { type: 'swimPace', fastestSecPer100m: 95, slowestSecPer100m: 101 },
            },
            { kind: 'step', intensity: 'rest', durationSec: 20, target: { type: 'open' } },
          ],
        },
      ],
    };
    const out = decodeWorkoutFit(encodeWorkoutFit(swim));
    expect(out.errors).toEqual([]);
    expect(out.sport).toBe('swimming');
    expect(out.poolLengthM).toBe(25);
    expect(out.steps[0]).toMatchObject({ durationType: 'distance', durationDistance: 100 });
    expect(out.steps[1]).toMatchObject({ intensity: 'rest', durationTime: 20 });
    expect(out.steps[2]).toMatchObject({ repeatSteps: 8 });
  });

  it('rejects bytes that are not a FIT file', () => {
    expect(isWorkoutFit(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe('GPX course', () => {
  it('writes a track with elevation and escapes the name', () => {
    const gpx = routeToGpx(
      {
        id: 'r1',
        name: 'Loop <east> & back',
        sport: 'run',
        points: [
          { lat: 47.37, lon: 8.54, ele: 410 },
          { lat: 47.371, lon: 8.541, ele: null },
        ],
      },
      new Date('2026-11-01T00:00:00Z'),
    );
    expect(gpx).toContain('<name>Loop &#60;east&#62; &#38; back</name>');
    expect(gpx).toContain('<trkpt lat="47.370000" lon="8.540000"><ele>410.0</ele></trkpt>');
    expect(gpx).toContain('<trkpt lat="47.371000" lon="8.541000"></trkpt>');
    expect(gpx).toContain('<type>running</type>');
  });
});
