import { describe, expect, it } from 'vitest';

import { calculateHrZones, defaultHrMethod, estimateHrMax, type HrZoneResult } from './hr';
import type { Result } from './result';

function expectOk<T, F extends string>(result: Result<T, F>): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.issues)}`);
  return result.value;
}

function issuesOf(result: Result<HrZoneResult, string>) {
  if (result.ok) throw new Error('expected validation issues');
  return result.issues;
}

/** Zones as [min, max] pairs for compact assertions. */
function ranges(value: HrZoneResult) {
  return value.zones.map((z) => [z.minBpm, z.maxBpm]);
}

describe('estimateHrMax', () => {
  it('uses 208 − 0.7 × age, rounded', () => {
    expect(estimateHrMax(30)).toBe(187);
    expect(estimateHrMax(40)).toBe(180);
    expect(estimateHrMax(45)).toBe(177); // 176.5 → 177
  });

  it('rejects invalid ages', () => {
    expect(() => estimateHrMax(0)).toThrow(RangeError);
    expect(() => estimateHrMax(-5)).toThrow(RangeError);
    expect(() => estimateHrMax(Number.NaN)).toThrow(RangeError);
  });
});

describe('defaultHrMethod', () => {
  it('picks Karvonen when resting HR is known, otherwise %HRmax', () => {
    expect(defaultHrMethod({ restingHr: 55 })).toBe('karvonen');
    expect(defaultHrMethod({})).toBe('percentMax');
  });
});

describe('calculateHrZones – %HRmax', () => {
  it('estimates HRmax from age when it is missing and flags it', () => {
    const value = expectOk(calculateHrZones({ age: 30 }));
    expect(value.method).toBe('percentMax');
    expect(value.hrMax).toBe(187);
    expect(value.hrMaxIsEstimate).toBe(true);
    expect(ranges(value)).toEqual([
      [94, 111],
      [112, 130],
      [131, 149],
      [150, 167],
      [168, 187],
    ]);
  });

  it('prefers a measured HRmax over the age estimate', () => {
    const value = expectOk(calculateHrZones({ age: 30, hrMax: 200 }));
    expect(value.hrMax).toBe(200);
    expect(value.hrMaxIsEstimate).toBe(false);
    expect(ranges(value)).toEqual([
      [100, 119],
      [120, 139],
      [140, 159],
      [160, 179],
      [180, 200],
    ]);
  });

  it('works with HRmax alone (no age)', () => {
    expect(expectOk(calculateHrZones({ hrMax: 180 })).hrMaxIsEstimate).toBe(false);
  });

  it('ignores resting HR when %HRmax is chosen explicitly', () => {
    const value = expectOk(calculateHrZones({ method: 'percentMax', hrMax: 200, restingHr: 50 }));
    expect(value.method).toBe('percentMax');
    expect(value.restingHr).toBeNull();
    expect(value.zones[0]?.minBpm).toBe(100);
  });

  it('requires age or HRmax', () => {
    expect(issuesOf(calculateHrZones({}))).toEqual([{ field: 'age', code: 'ageOrHrMaxRequired' }]);
  });
});

describe('calculateHrZones – Karvonen', () => {
  it('is the default when resting HR is given', () => {
    const value = expectOk(calculateHrZones({ hrMax: 190, restingHr: 50 }));
    expect(value.method).toBe('karvonen');
    expect(value.restingHr).toBe(50);
    expect(ranges(value)).toEqual([
      [120, 133],
      [134, 147],
      [148, 161],
      [162, 175],
      [176, 190],
    ]);
  });

  it('combines resting HR with the age estimate', () => {
    const value = expectOk(calculateHrZones({ age: 30, restingHr: 60 }));
    expect(value.hrMax).toBe(187);
    expect(value.hrMaxIsEstimate).toBe(true);
    // Z2 lower = 60 + 0.6 × 127 = 136.2
    expect(value.zones[1]?.minBpm).toBe(136);
  });

  it('requires resting HR when chosen explicitly', () => {
    expect(issuesOf(calculateHrZones({ method: 'karvonen', age: 30 }))).toEqual([
      { field: 'restingHr', code: 'required' },
    ]);
  });

  it('rejects a resting HR at or above HRmax', () => {
    expect(issuesOf(calculateHrZones({ hrMax: 110, restingHr: 110 }))).toEqual([
      { field: 'restingHr', code: 'restingHrNotBelowHrMax', params: { hrMax: 110 } },
    ]);
  });

  it('handles the narrowest heart-rate reserve the limits allow', () => {
    // age 100 → HRmax estimate 138; max resting HR 120 → reserve 18 bpm
    const value = expectOk(calculateHrZones({ age: 100, restingHr: 120 }));
    expect(value.zones[0]?.minBpm).toBe(129);
    expect(value.zones[4]?.maxBpm).toBe(138);
  });
});

describe('calculateHrZones – LTHR (Friel)', () => {
  it('builds open-ended zones without HRmax', () => {
    const value = expectOk(calculateHrZones({ method: 'lthr', lthr: 170 }));
    expect(value.method).toBe('lthr');
    expect(value.lthr).toBe(170);
    expect(value.hrMax).toBeNull();
    expect(value.hrMaxIsEstimate).toBe(false);
    expect(ranges(value)).toEqual([
      [null, 144],
      [145, 152],
      [153, 161],
      [162, 169],
      [170, null],
    ]);
  });

  it('caps Z5 with a measured HRmax', () => {
    const value = expectOk(calculateHrZones({ method: 'lthr', lthr: 170, hrMax: 190 }));
    expect(value.hrMax).toBe(190);
    expect(value.zones[4]).toEqual({ zone: 5, minBpm: 170, maxBpm: 190 });
  });

  it('does not use the age estimate (it may be below a real LTHR)', () => {
    // age 60 → estimate 166, LTHR 170 is still accepted
    const value = expectOk(calculateHrZones({ method: 'lthr', lthr: 170, age: 60 }));
    expect(value.hrMax).toBeNull();
    expect(value.zones[4]?.maxBpm).toBeNull();
  });

  it('requires LTHR', () => {
    expect(issuesOf(calculateHrZones({ method: 'lthr', age: 30 }))).toEqual([
      { field: 'lthr', code: 'required' },
    ]);
  });

  it('rejects an LTHR at or above the measured HRmax', () => {
    expect(issuesOf(calculateHrZones({ method: 'lthr', lthr: 185, hrMax: 180 }))).toEqual([
      { field: 'lthr', code: 'lthrNotBelowHrMax', params: { hrMax: 180 } },
    ]);
  });
});

describe('calculateHrZones – unrealistic inputs', () => {
  it.each([
    ['age', { age: 5 }, { min: 10, max: 100 }],
    ['age', { age: 120 }, { min: 10, max: 100 }],
    ['hrMax', { hrMax: 90 }, { min: 100, max: 230 }],
    ['hrMax', { hrMax: 250 }, { min: 100, max: 230 }],
    ['restingHr', { hrMax: 190, restingHr: 20 }, { min: 25, max: 120 }],
    ['restingHr', { hrMax: 190, restingHr: 130 }, { min: 25, max: 120 }],
  ] as const)('flags %s out of range: %o', (field, input, params) => {
    expect(issuesOf(calculateHrZones(input))).toContainEqual({
      field,
      code: 'outOfRange',
      params,
    });
  });

  it('flags LTHR out of range', () => {
    expect(issuesOf(calculateHrZones({ method: 'lthr', lthr: 240 }))).toEqual([
      { field: 'lthr', code: 'outOfRange', params: { min: 90, max: 220 } },
    ]);
  });

  it('flags NaN and Infinity as out of range', () => {
    expect(issuesOf(calculateHrZones({ age: Number.NaN }))[0]?.code).toBe('outOfRange');
    expect(issuesOf(calculateHrZones({ hrMax: Infinity }))[0]?.code).toBe('outOfRange');
  });

  it('does not fall back to the age estimate when the measured HRmax is invalid', () => {
    const issues = issuesOf(calculateHrZones({ age: 30, hrMax: 300 }));
    expect(issues).toEqual([
      { field: 'hrMax', code: 'outOfRange', params: { min: 100, max: 230 } },
    ]);
  });

  it('reports every problem at once', () => {
    const issues = issuesOf(calculateHrZones({ method: 'karvonen', age: 3 }));
    expect(issues.map((i) => i.code)).toEqual(['outOfRange', 'required']);
  });

  it('accepts the limits themselves', () => {
    expect(calculateHrZones({ age: 10 }).ok).toBe(true);
    expect(calculateHrZones({ age: 100 }).ok).toBe(true);
    expect(calculateHrZones({ hrMax: 230, restingHr: 25 }).ok).toBe(true);
  });
});

describe('zone structure', () => {
  it('produces five contiguous zones for every method', () => {
    const results = [
      calculateHrZones({ age: 47 }),
      calculateHrZones({ hrMax: 183, restingHr: 47 }),
      calculateHrZones({ method: 'lthr', lthr: 163, hrMax: 181 }),
    ];
    for (const result of results) {
      const zones = expectOk(result).zones;
      expect(zones.map((z) => z.zone)).toEqual([1, 2, 3, 4, 5]);
      for (let i = 1; i < zones.length; i++) {
        expect(zones[i]?.minBpm).toBe((zones[i - 1]?.maxBpm ?? NaN) + 1);
      }
    }
  });
});
