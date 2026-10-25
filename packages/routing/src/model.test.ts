import { describe, expect, it } from 'vitest';

import {
  applySwissProfile,
  cacheKey,
  capPoints,
  closer,
  correctedLength,
  distanceM,
  inSwitzerland,
  mapOrsRoundTrip,
  orsProfile,
  orsRoundTripBody,
  parseRoundTripQuery,
  snapQuery,
  surfaceSuitability,
  swissProfileRequest,
  thinPoints,
  toLv95,
  type RoundTripCandidate,
  type RoutePoint,
} from './index';

const ZURICH = { lat: 47.37689, lon: 8.54169 };
const M_PER_DEG_LAT = 111_194.93;

/** Straight line north from Zurich, a point every `step` m. */
function line(lengthM: number, step = 50): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (let d = 0; d <= lengthM; d += step) {
    out.push({ lat: ZURICH.lat + d / M_PER_DEG_LAT, lon: ZURICH.lon, ele: 400 });
  }
  return out;
}

const query = {
  lat: 47.376891,
  lon: 8.541694,
  sport: 'run' as const,
  targetDistanceM: 10_240,
  count: 5,
  gainPerKm: 10,
};

describe('query', () => {
  it('parses and rejects', () => {
    expect(parseRoundTripQuery(query)).toEqual(query);
    expect(parseRoundTripQuery({ ...query, count: undefined, gainPerKm: -1 })).toMatchObject({
      count: 5,
      gainPerKm: 0,
    });
    expect(parseRoundTripQuery(null)).toBeNull();
    expect(parseRoundTripQuery({ ...query, lat: 91 })).toBeNull();
    expect(parseRoundTripQuery({ ...query, lon: Number.NaN })).toBeNull();
    expect(parseRoundTripQuery({ ...query, sport: 'swim' })).toBeNull();
    expect(parseRoundTripQuery({ ...query, targetDistanceM: 0 })).toBeNull();
  });

  it('snaps start, distance and count', () => {
    expect(snapQuery(query)).toEqual({
      ...query,
      lat: 47.377,
      lon: 8.542,
      targetDistanceM: 10_000,
    });
    expect(snapQuery({ ...query, targetDistanceM: 500, count: 0 })).toMatchObject({
      targetDistanceM: 2000,
      count: 1,
    });
    expect(snapQuery({ ...query, targetDistanceM: 500_000, count: 50 })).toMatchObject({
      targetDistanceM: 100_000,
      count: 6,
    });
  });

  it('picks the profile and the cache key', () => {
    expect(orsProfile({ sport: 'bike', gainPerKm: 30 })).toBe('cycling-road');
    expect(orsProfile({ sport: 'run', gainPerKm: 10 })).toBe('foot-walking');
    expect(orsProfile({ sport: 'run', gainPerKm: 25 })).toBe('foot-hiking');
    expect(cacheKey(snapQuery(query))).toBe('ors:foot-walking:47.377:8.542:10000:5');
  });

  it('builds the ORS body', () => {
    expect(orsRoundTripBody(snapQuery(query), 3, 9876.4)).toEqual({
      coordinates: [[8.542, 47.377]],
      options: { round_trip: { length: 9876, points: 4, seed: 3 } },
      elevation: true,
      extra_info: ['surface'],
      instructions: false,
    });
  });
});

describe('ORS response', () => {
  it('rates the surface for the sport', () => {
    const summary = [
      { value: 3, distance: 600 },
      { value: 10, distance: 300 },
      { value: 15, distance: 100 },
      { value: 0, distance: 5000 },
      { distance: 50 },
      { value: 1, distance: 0 },
    ];
    expect(surfaceSuitability('bike', summary)).toBe(0.6);
    expect(surfaceSuitability('run', summary)).toBe(0.9);
    expect(surfaceSuitability('run', [{ value: 0, distance: 10 }])).toBeNull();
    expect(surfaceSuitability('run', undefined)).toBeNull();
  });

  it('maps a round trip', () => {
    const coordinates = line(1000, 5).map((p) => [p.lon, p.lat, 410]);
    coordinates.push([8.5, Number.NaN as unknown as number]);
    const c = mapOrsRoundTrip(
      {
        features: [
          {
            geometry: { coordinates: [...coordinates, ['x' as unknown as number]] },
            properties: {
              summary: { distance: 1000.4 },
              extras: { surface: { summary: [{ value: 3, distance: 1000 }] } },
            },
          },
        ],
      },
      'bike',
      'ors-0',
    ) as RoundTripCandidate;
    expect(c.id).toBe('ors-0');
    expect(c.distanceM).toBe(1000);
    expect(c.surfaceSuitability).toBe(1);
    // Thinned to ≥ 8 m spacing; heights kept, a missing height is null.
    expect(c.points.length).toBeLessThan(coordinates.length / 1.5);
    expect(c.points[0]).toEqual({ lat: ZURICH.lat, lon: ZURICH.lon, ele: 410 });
    expect(c.points.at(-1)?.ele).toBeNull();

    const noSummary = mapOrsRoundTrip(
      { features: [{ geometry: { coordinates: line(1000).map((p) => [p.lon, p.lat]) } }] },
      'run',
      'ors-1',
    );
    expect(noSummary?.distanceM).toBe(1000);
    expect(noSummary?.points[0]?.ele).toBeNull();
    expect(noSummary?.surfaceSuitability).toBeNull();
    expect(mapOrsRoundTrip({}, 'run', 'x')).toBeNull();
    expect(
      mapOrsRoundTrip({ features: [{ geometry: { coordinates: [[8, 47]] } }] }, 'run', 'x'),
    ).toBeNull();
  });

  it('corrects a length that missed by far, and keeps the closer attempt', () => {
    expect(correctedLength(10_000, 10_000, 11_000)).toBeNull();
    expect(correctedLength(10_000, 10_000, 14_000)).toBe(7143);
    expect(correctedLength(10_000, 10_000, 0)).toBeNull();
    expect(correctedLength(3000, 3000, 9000)).toBe(2000);
    const a: RoundTripCandidate = {
      id: 'a',
      points: [],
      distanceM: 14_000,
      surfaceSuitability: null,
    };
    const b = { ...a, id: 'b', distanceM: 9_500 };
    expect(closer(10_000, a, b).id).toBe('b');
    expect(closer(10_000, b, a).id).toBe('b');
    expect(closer(10_000, a, null).id).toBe('a');
  });
});

describe('geometry helpers', () => {
  it('measures, thins and caps', () => {
    expect(
      distanceM(ZURICH, { lat: ZURICH.lat + (1 / M_PER_DEG_LAT) * 1000, lon: ZURICH.lon }),
    ).toBeCloseTo(1000, 0);
    const pts = line(100, 1);
    const thin = thinPoints(pts, 10);
    expect(thin).toHaveLength(11);
    expect(thin.at(-1)).toBe(pts.at(-1));
    expect(thinPoints(pts.slice(0, 2), 10)).toHaveLength(2);
    expect(capPoints([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 3)).toEqual([1, 6, 11]);
    expect(capPoints([1, 2], 3)).toEqual([1, 2]);
  });
});

describe('swisstopo', () => {
  it('knows Switzerland', () => {
    expect(inSwitzerland(ZURICH)).toBe(true);
    expect(inSwitzerland({ lat: 48.14, lon: 11.58 })).toBe(false);
  });

  it('converts to LV95 (swisstopo reference point)', () => {
    // Swisstopo's worked example: 46°02'38.87" N, 8°43'49.79" E → E 2 699 999.76, N 1 099 999.97.
    const [e, n] = toLv95({ lat: 46 + 2 / 60 + 38.87 / 3600, lon: 8 + 43 / 60 + 49.79 / 3600 });
    expect(e).toBeCloseTo(2_700_000, -1);
    expect(n).toBeCloseTo(1_100_000, -1);
  });

  it('builds the profile request', () => {
    const r = swissProfileRequest(line(30_000, 10), 30_000);
    expect(r.geom.type).toBe('LineString');
    expect(r.geom.coordinates).toHaveLength(1000);
    expect(r.samples).toBe(1000);
    expect(swissProfileRequest(line(1000), 1000).samples).toBe(200);
  });

  it('applies the terrain model heights along the route', () => {
    const pts = line(1000, 100);
    const profile = Array.from({ length: 11 }, (_, i) => ({
      dist: i * 100,
      alts: { COMB: 500 + i * 10, DTM2: null, DTM25: null },
    }));
    const out = applySwissProfile(pts, profile) as RoutePoint[];
    expect(out.map((p) => p.ele)).toEqual([500, 510, 520, 530, 540, 550, 560, 570, 580, 590, 600]);

    // A gap in the middle (outside Switzerland) and uncovered ends keep the global DEM height.
    const gappy = profile.map((p, i) =>
      i === 0 || i === 10 || (i >= 4 && i <= 7) ? { dist: p.dist, alts: { COMB: null } } : p,
    );
    const withGap = applySwissProfile(pts, gappy) as RoutePoint[];
    expect(withGap[0]?.ele).toBe(400);
    expect(withGap[2]?.ele).toBe(520);
    expect(withGap[5]?.ele).toBe(400);
    expect(withGap[9]?.ele).toBe(590);

    expect(applySwissProfile(pts, [])).toBeNull();
    expect(applySwissProfile(pts, [{ dist: 0, alts: { COMB: 0 } }, { dist: 10 }])).toBeNull();
    // DTM2 / DTM25 fill in for a missing COMB; a single point keeps its own position.
    const single = applySwissProfile(
      [pts[0] as RoutePoint],
      [
        { dist: 0, alts: { DTM2: 450 } },
        { dist: 10, alts: { DTM25: 451 } },
      ],
    );
    expect(single?.[0]?.ele).toBe(450);
  });
});
