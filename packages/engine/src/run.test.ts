import { describe, expect, it } from 'vitest';

import type { Result } from './result';
import {
  analyzeRaceResult,
  predictRaceTime,
  RACE_DISTANCES_M,
  realisticRaceTimeRange,
  type RaceAnalysis,
} from './run';

function expectOk(result: Result<RaceAnalysis, string>): RaceAnalysis {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.issues)}`);
  return result.value;
}

describe('predictRaceTime (Riegel)', () => {
  it('applies T2 = T1 × (D2/D1)^1.06', () => {
    // 10k 50:00 → 5k ≈ 23:59, half ≈ 1:50:19
    expect(predictRaceTime(10000, 3000, 5000)).toBeCloseTo(1438.9, 1);
    expect(predictRaceTime(10000, 3000, 21097.5)).toBeCloseTo(6619, 0);
  });

  it('returns the input time for the same distance', () => {
    expect(predictRaceTime(5000, 1500, 5000)).toBe(1500);
  });

  it('accepts a custom exponent', () => {
    expect(predictRaceTime(5000, 1000, 10000, 1)).toBe(2000);
  });

  it.each([
    [0, 1500, 10000],
    [5000, -1, 10000],
    [5000, 1500, Number.NaN],
  ])('rejects non-positive or non-finite input (%d, %d, %d)', (d1, t1, d2) => {
    expect(() => predictRaceTime(d1, t1, d2)).toThrow(RangeError);
  });
});

describe('realisticRaceTimeRange', () => {
  it('derives limits from 2:30–15:00 min/km', () => {
    expect(realisticRaceTimeRange('5k')).toEqual({ min: 750, max: 4500 });
    expect(realisticRaceTimeRange('half')).toEqual({ min: 3165, max: 18988 });
  });
});

describe('analyzeRaceResult', () => {
  it('computes race pace, threshold pace, predictions and zones from a 10k', () => {
    const value = expectOk(analyzeRaceResult({ distance: '10k', timeSec: 3000 }));
    expect(value.paceSecPerKm).toBe(300);
    // Threshold ≈ pace for a 1-hour race, slightly slower than 10k pace.
    expect(value.thresholdPaceSecPerKm).toBe(303);
    expect(value.predictions).toEqual([
      { distance: '5k', timeSec: 1439, paceSecPerKm: 288, isInput: false },
      { distance: '10k', timeSec: 3000, paceSecPerKm: 300, isInput: true },
      { distance: 'half', timeSec: 6619, paceSecPerKm: 314, isInput: false },
      { distance: 'marathon', timeSec: 13801, paceSecPerKm: 327, isInput: false },
    ]);
    expect(value.paceZones).toEqual([
      { zone: 1, slowestSec: null, fastestSec: 391 },
      { zone: 2, slowestSec: 390, fastestSec: 346 },
      { zone: 3, slowestSec: 345, fastestSec: 321 },
      { zone: 4, slowestSec: 320, fastestSec: 300 },
      { zone: 5, slowestSec: 299, fastestSec: null },
    ]);
  });

  it('works from a 5k', () => {
    const value = expectOk(analyzeRaceResult({ distance: '5k', timeSec: 1500 }));
    expect(value.thresholdPaceSecPerKm).toBe(315);
    expect(value.predictions.find((p) => p.distance === '10k')?.timeSec).toBe(3127);
  });

  it('works from a half marathon (threshold faster than half pace)', () => {
    const value = expectOk(analyzeRaceResult({ distance: 'half', timeSec: 6300 }));
    expect(value.paceSecPerKm).toBe(299);
    expect(value.thresholdPaceSecPerKm).toBeLessThan(value.paceSecPerKm);
  });

  it('is consistent: predictions get slower per km with distance', () => {
    const value = expectOk(analyzeRaceResult({ distance: '10k', timeSec: 2400 }));
    const paces = value.predictions.map((p) => p.paceSecPerKm);
    expect([...paces].sort((a, b) => a - b)).toEqual(paces);
  });

  it('keeps pace zones contiguous', () => {
    const zones = expectOk(analyzeRaceResult({ distance: '5k', timeSec: 1200 })).paceZones;
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i]?.slowestSec).toBe((zones[i - 1]?.fastestSec ?? NaN) - 1);
    }
  });

  it('requires a time', () => {
    expect(analyzeRaceResult({ distance: '5k' })).toEqual({
      ok: false,
      issues: [{ field: 'timeSec', code: 'required' }],
    });
  });

  it.each([
    ['5k', 600], // 2:00 min/km – faster than the world record
    ['5k', 5000], // 16:40 min/km
    ['10k', 0],
    ['half', Number.NaN],
  ] as const)('rejects an unrealistic %s time of %d s', (distance, timeSec) => {
    const result = analyzeRaceResult({ distance, timeSec });
    expect(result).toEqual({
      ok: false,
      issues: [
        {
          field: 'timeSec',
          code: 'unrealisticRaceTime',
          params: realisticRaceTimeRange(distance),
        },
      ],
    });
  });

  it('accepts times exactly at the limits', () => {
    expect(analyzeRaceResult({ distance: '5k', timeSec: 750 }).ok).toBe(true);
    expect(analyzeRaceResult({ distance: '5k', timeSec: 4500 }).ok).toBe(true);
  });

  it('knows the official distances', () => {
    expect(RACE_DISTANCES_M).toEqual({ '5k': 5000, '10k': 10000, half: 21097.5, marathon: 42195 });
  });
});
