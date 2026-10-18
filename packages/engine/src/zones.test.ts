import { describe, expect, it } from 'vitest';

import { paceZonesFromBoundaries, ZONE_NUMBERS } from './zones';

describe('paceZonesFromBoundaries', () => {
  it('creates five contiguous zones from four rounded boundaries', () => {
    expect(paceZonesFromBoundaries([390.6, 345.5, 320.4, 300])).toEqual([
      { zone: 1, slowestSec: null, fastestSec: 391 },
      { zone: 2, slowestSec: 390, fastestSec: 346 },
      { zone: 3, slowestSec: 345, fastestSec: 320 },
      { zone: 4, slowestSec: 319, fastestSec: 300 },
      { zone: 5, slowestSec: 299, fastestSec: null },
    ]);
  });

  it('requires exactly four boundaries', () => {
    expect(() => paceZonesFromBoundaries([1, 2, 3])).toThrow(RangeError);
    expect(() => paceZonesFromBoundaries([1, 2, 3, 4, 5])).toThrow(RangeError);
  });

  it('exposes the zone numbers', () => {
    expect(ZONE_NUMBERS).toEqual([1, 2, 3, 4, 5]);
  });
});
