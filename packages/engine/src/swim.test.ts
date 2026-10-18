import { describe, expect, it } from 'vitest';

import { calculateCss } from './swim';

describe('calculateCss', () => {
  it('computes CSS speed, pace per 100 m and zones', () => {
    // 400 m in 6:40, 200 m in 3:10 → CSS = 200 / 210 m/s, pace 1:45 /100 m
    const result = calculateCss({ time400Sec: 400, time200Sec: 190 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cssMetersPerSec).toBeCloseTo(0.9524, 4);
    expect(result.value.cssPacePer100mSec).toBe(105);
    expect(result.value.zones).toEqual([
      { zone: 1, slowestSec: null, fastestSec: 120 },
      { zone: 2, slowestSec: 119, fastestSec: 113 },
      { zone: 3, slowestSec: 112, fastestSec: 108 },
      { zone: 4, slowestSec: 107, fastestSec: 103 },
      { zone: 5, slowestSec: 102, fastestSec: null },
    ]);
  });

  it('rounds half-second CSS paces', () => {
    // delta 191 s → 95.5 s per 100 m → 96
    const result = calculateCss({ time400Sec: 371, time200Sec: 180 });
    expect(result.ok && result.value.cssPacePer100mSec).toBe(96);
  });

  it('requires both times', () => {
    expect(calculateCss({})).toEqual({
      ok: false,
      issues: [
        { field: 'time400Sec', code: 'required' },
        { field: 'time200Sec', code: 'required' },
      ],
    });
    expect(calculateCss({ time400Sec: 400 })).toEqual({
      ok: false,
      issues: [{ field: 'time200Sec', code: 'required' }],
    });
  });

  it.each([
    [{ time400Sec: 120, time200Sec: 190 }, 'time400Sec', { min: 210, max: 1260 }],
    [{ time400Sec: 1300, time200Sec: 190 }, 'time400Sec', { min: 210, max: 1260 }],
    [{ time400Sec: 400, time200Sec: 60 }, 'time200Sec', { min: 100, max: 600 }],
    [{ time400Sec: 400, time200Sec: 700 }, 'time200Sec', { min: 100, max: 600 }],
  ] as const)('rejects out-of-range times %o', (input, field, params) => {
    const result = calculateCss(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({ field, code: 'outOfRange', params });
  });

  it('rejects a 400 m pace that is not slower than the 200 m pace', () => {
    expect(calculateCss({ time400Sec: 380, time200Sec: 190 })).toEqual({
      ok: false,
      issues: [{ field: 'time400Sec', code: 'swim400NotSlowerThan200' }],
    });
    expect(calculateCss({ time400Sec: 360, time200Sec: 190 }).ok).toBe(false);
  });

  it('rejects times that are too far apart to be two all-out efforts', () => {
    // 400 m more than 2.5 × the 200 m time
    expect(calculateCss({ time400Sec: 520, time200Sec: 200 })).toEqual({
      ok: false,
      issues: [{ field: 'time400Sec', code: 'swimTimesInconsistent' }],
    });
    expect(calculateCss({ time400Sec: 500, time200Sec: 200 }).ok).toBe(true);
  });

  it('skips the cross-check when a single time is already invalid', () => {
    const result = calculateCss({ time400Sec: 100, time200Sec: 190 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.code)).toEqual(['outOfRange']);
  });
});
