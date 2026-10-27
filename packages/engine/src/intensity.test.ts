import { describe, expect, it } from 'vitest';

import { calculateHrZones, HR_ZONE_METHODS } from './hr';
import { bandAnchor, prescriptionBands } from './intensity';

const range = (bands: ReturnType<typeof prescriptionBands>, zone: number) => {
  const b = bands.find((x) => x.zone === zone);
  return [b?.minBpm, b?.maxBpm];
};

describe('prescription bands (an intensity, not a zone number)', () => {
  it('easy for LTHR 178 / HRmax 204 is about 139–159 bpm – wide enough to run in', () => {
    const bands = prescriptionBands({ lthr: 178, hrMax: 204 });
    expect(range(bands, 2)).toEqual([139, 159]);
    expect(bands.map((b) => b.intensity)).toEqual([
      'recovery',
      'easy',
      'tempo',
      'threshold',
      'vo2',
    ]);
    const easy = bands[1] as { minBpm: number; maxBpm: number };
    expect(easy.maxBpm - easy.minBpm).toBeGreaterThanOrEqual(15);
    // Contiguous, and Z5 ends at HRmax at the latest.
    for (let i = 1; i < bands.length; i++)
      expect(bands[i]?.minBpm).toBe((bands[i - 1]?.maxBpm as number) + 1);
    expect(bands[4]?.maxBpm).toBeLessThanOrEqual(204);
  });

  it('is the same session whichever method the zone table shows', () => {
    const input = { age: 38, hrMax: 204, restingHr: 50, lthr: 178 };
    const prescribed = prescriptionBands(input);
    const tables = HR_ZONE_METHODS.map((method) => calculateHrZones({ ...input, method }));
    // The tables differ (that is what the methods are for) …
    const z2 = tables.map((r) => (r.ok ? r.value.zones[1] : null));
    expect(new Set(z2.map((z) => `${z?.minBpm}-${z?.maxBpm}`)).size).toBe(3);
    // … the prescription does not depend on which one is picked: it takes no method at all.
    for (const method of HR_ZONE_METHODS) {
      expect(prescriptionBands({ ...input, ...{ method } })).toEqual(prescribed);
    }
  });

  it('without LTHR it anchors on the HR reserve, then on HRmax – landing in the same place', () => {
    expect(bandAnchor({ restingHr: 50, hrMax: 204 })?.anchor).toBe('hrReserve');
    expect(range(prescriptionBands({ restingHr: 50, hrMax: 204 }), 2)).toEqual([139, 159]);
    expect(bandAnchor({ hrMax: 204 })?.anchor).toBe('hrMax');
    expect(range(prescriptionBands({ hrMax: 204 }), 2)).toEqual([140, 161]);
    // Age only: the HRmax estimate (208 − 0.7 × 38 = 181).
    expect(bandAnchor({ age: 38 })).toMatchObject({ anchor: 'hrMax', hrMax: 181 });
    // A resting HR above HRmax is ignored rather than producing nonsense.
    expect(bandAnchor({ restingHr: 210, hrMax: 204 })?.anchor).toBe('hrMax');
    expect(prescriptionBands({})).toEqual([]);
  });

  it('LTHR without any HRmax leaves Z5 at its calculated top', () => {
    const bands = prescriptionBands({ lthr: 170 });
    expect(bands[4]).toMatchObject({ minBpm: 170, maxBpm: 180, anchor: 'lthr' });
    // An HRmax estimate below the LTHR never makes Z5 end below where it starts.
    const low = prescriptionBands({ lthr: 190, age: 70 });
    expect((low[4]?.maxBpm as number) >= (low[4]?.minBpm as number)).toBe(true);
  });

  it('a range the user set by hand for a zone wins (their entry always wins)', () => {
    const bands = prescriptionBands({ lthr: 178 }, { 2: { minBpm: 135, maxBpm: 155 } });
    expect(bands[1]).toMatchObject({ minBpm: 135, maxBpm: 155, anchor: 'custom' });
    expect(bands[0]?.anchor).toBe('lthr');
  });
});
