export type ZoneNumber = 1 | 2 | 3 | 4 | 5;

export const ZONE_NUMBERS: readonly ZoneNumber[] = [1, 2, 3, 4, 5];

/**
 * A pace zone in seconds per distance unit (km for running, 100 m for swimming).
 * Larger numbers are slower. `null` means open-ended (Z1 has no slowest, Z5 no fastest pace).
 */
export interface PaceZone {
  zone: ZoneNumber;
  slowestSec: number | null;
  fastestSec: number | null;
}

/**
 * Builds five contiguous pace zones from four boundaries ordered slow → fast.
 * Boundaries are rounded to whole seconds; zone n+1 starts one second faster than zone n ends.
 */
export function paceZonesFromBoundaries(boundariesSlowToFast: readonly number[]): PaceZone[] {
  if (boundariesSlowToFast.length !== 4) {
    throw new RangeError('exactly four pace zone boundaries are required');
  }
  const b = boundariesSlowToFast.map((value) => Math.round(value)) as [
    number,
    number,
    number,
    number,
  ];
  return [
    { zone: 1, slowestSec: null, fastestSec: b[0] },
    { zone: 2, slowestSec: b[0] - 1, fastestSec: b[1] },
    { zone: 3, slowestSec: b[1] - 1, fastestSec: b[2] },
    { zone: 4, slowestSec: b[2] - 1, fastestSec: b[3] },
    { zone: 5, slowestSec: b[3] - 1, fastestSec: null },
  ];
}
