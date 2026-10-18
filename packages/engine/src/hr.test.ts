import { describe, expect, it } from 'vitest';

import { estimateHrMax } from './hr';

describe('estimateHrMax', () => {
  it('uses 208 − 0.7 × age', () => {
    expect(estimateHrMax(30)).toBe(187);
    expect(estimateHrMax(40)).toBe(180);
  });

  it('rejects invalid ages', () => {
    expect(() => estimateHrMax(0)).toThrow(RangeError);
    expect(() => estimateHrMax(Number.NaN)).toThrow(RangeError);
  });
});
