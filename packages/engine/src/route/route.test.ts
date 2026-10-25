import { describe, expect, it } from 'vitest';

import { calculateHrZones } from '../hr';
import { allWorkouts, newPlanState, setWorkoutRoute, type PlanState } from '../plan/edit';
import { generatePlan } from '../plan/generate';
import type { ElevationPoint } from '../plan/terrain';
import type { UserProfile, Workout } from '../plan/types';
import { recogniseRoutes, sameTrack, type TrackActivity } from './cluster';
import { evaluateActivity, type ActivityStream } from './evaluate';
import {
  boundingBox,
  cumulativeDistances,
  decodePolyline,
  encodePolyline,
  haversineM,
  normalizeTrack,
  resampleTrack,
  simplifyTrack,
  trackLengthM,
  type LatLon,
} from './geo';
import { parseGpx, type GpxPoint } from './gpx';
import { rankRoutes, scoreRoute, type MatchableRoute } from './match';
import {
  estimateBikeRouteDurationSec,
  estimateSessionOnRouteSec,
  mainSetFlatPace,
  routePacePlan,
  sessionFlatSpeedKmh,
} from './pace-plan';
import {
  buildRouteProfile,
  elevationStats,
  findClimbs,
  hasHillRepeatSegment,
  profileFromStreams,
  smoothProfile,
} from './profile';
import {
  matchableCandidate,
  pickRoundTrips,
  roundTripDistanceM,
  roundTripRequest,
  type RoundTripCandidate,
} from './routing';
import { classifyTerrain, learnTerrainProfile } from './terrain-profile';

// ---------------------------------------------------------------------------------------------
// Fixtures

const ORIGIN: LatLon = { lat: 47.0, lon: 8.0 };
const M_PER_DEG_LAT = 111_194.93;

/** Point `north` / `east` metres from the origin. */
function at(north: number, east = 0, origin = ORIGIN): LatLon {
  return {
    lat: origin.lat + north / M_PER_DEG_LAT,
    lon: origin.lon + east / (M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180)),
  };
}

/** Straight track north, a point every `step` m, elevation from `ele(distance)`. */
function line(lengthM: number, ele: (d: number) => number | null, step = 25): GpxPoint[] {
  const out: GpxPoint[] = [];
  for (let d = 0; d <= lengthM; d += step) out.push({ ...at(d), ele: ele(d) });
  return out;
}

/** Out-and-back loop: `half` m north 10 m east of the outbound line, then back. */
function loop(half: number, ele: (d: number) => number, origin = ORIGIN, jitter = 0): GpxPoint[] {
  const out: GpxPoint[] = [];
  for (let d = 0; d <= half; d += 50) out.push({ ...at(d, jitter, origin), ele: ele(d) });
  for (let d = half; d >= 0; d -= 50) out.push({ ...at(d, 10 + jitter, origin), ele: ele(d) });
  return out;
}

const profile: UserProfile = {
  age: 35,
  experience: 'intermediate',
  sports: ['run', 'bike'],
  terrain: 'rolling',
  strength: { mode: 'none' },
};

function plan(): PlanState {
  const r = generatePlan(
    profile,
    { kind: 'half' },
    { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
    '2026-10-19',
    '2027-02-14',
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return newPlanState(r.value);
}

const state = plan();
const workouts = allWorkouts(state.plan);
const easyRun = workouts.find((w) => w.sport === 'run' && w.paceMode === 'limit') as Workout;
const keyRun = workouts.find((w) => w.sport === 'run' && w.paceMode === 'target') as Workout;
const ride = workouts.find((w) => w.sport === 'bike') as Workout;
const swim: Workout = { ...easyRun, id: 'swim-1', sport: 'swim' };

const profileOf = (points: readonly GpxPoint[]) => buildRouteProfile(points).profile;
const flatProfile = (lengthM: number): ElevationPoint[] => [
  { distanceM: 0, elevationM: 400 },
  { distanceM: lengthM, elevationM: 400 },
];

// ---------------------------------------------------------------------------------------------

describe('geo', () => {
  it('measures distances on the sphere', () => {
    expect(haversineM(ORIGIN, at(1000))).toBeCloseTo(1000, 0);
    expect(haversineM(ORIGIN, at(0, 1000))).toBeCloseTo(1000, 0);
    expect(cumulativeDistances([ORIGIN, at(100), at(300)]).map(Math.round)).toEqual([0, 100, 300]);
    expect(trackLengthM([])).toBe(0);
  });

  it('round-trips Google encoded polylines', () => {
    // Example from Google's documentation.
    const points = [
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ];
    expect(encodePolyline(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(points);
    expect(decodePolyline('')).toEqual([]);
    // Truncated or invalid input stops at the last complete point.
    expect(decodePolyline('_p~iF~ps|U_ulL')).toHaveLength(1);
    expect(decodePolyline('_p~iF~ps|U ')).toHaveLength(1);
  });

  it('simplifies tracks but keeps corners and extra fields', () => {
    const straight = line(1000, () => 5);
    expect(simplifyTrack(straight, 5)).toEqual([straight[0], straight.at(-1)]);
    const corner = [
      { ...ORIGIN, ele: 1 },
      { ...at(500), ele: 2 },
      { ...at(500, 500), ele: 3 },
    ];
    expect(simplifyTrack(corner, 5)).toHaveLength(3);
    expect(simplifyTrack(corner.slice(0, 2), 5)).toHaveLength(2);
    // A point on top of the start (zero-length segment) is measured from that point.
    expect(simplifyTrack([ORIGIN, at(100, 100), ORIGIN], 5)).toHaveLength(3);
  });

  it('normalises a track into a square for thumbnails', () => {
    expect(boundingBox([])).toBeNull();
    expect(normalizeTrack([ORIGIN], 40)).toEqual([]);
    const tall = normalizeTrack([ORIGIN, at(1000), at(1000, 500)], 40, 2);
    expect(tall[0]).toEqual({ x: 11, y: 38 });
    expect(tall[1]).toEqual({ x: 11, y: 2 });
    expect(tall[2]?.x).toBeCloseTo(29, 0);
    // A single repeated point stays in the middle.
    expect(normalizeTrack([ORIGIN, ORIGIN], 40)).toEqual([
      { x: 20, y: 20 },
      { x: 20, y: 20 },
    ]);
  });

  it('resamples tracks at equal distances', () => {
    const samples = resampleTrack([ORIGIN, at(100), at(100), at(300)], 4);
    expect(cumulativeDistances(samples).map(Math.round)).toEqual([0, 100, 200, 300]);
    expect(resampleTrack([], 4)).toEqual([]);
    expect(resampleTrack([ORIGIN, ORIGIN], 3)).toEqual([ORIGIN, ORIGIN, ORIGIN]);
  });
});

describe('parseGpx', () => {
  const gpx = (body: string) =>
    `<?xml version="1.0"?><gpx version="1.1"><metadata><name>File</name></metadata>${body}</gpx>`;

  it('reads track points with elevation and the track name', () => {
    const r = parseGpx(
      gpx(`<trk><name>Hausrunde &amp; Hügel &#x2192; &#8364; &bogus;</name><trkseg>
        <trkpt lat="47.0" lon="8.0"><ele>400.5</ele><time>2026-10-01T06:00:00Z</time></trkpt>
        <trkpt lon='8.001' lat='47.001'><ele></ele></trkpt>
        <trkpt lat="47.002" lon="8.002"/>
        <trkpt lat="" lon="8.0"/>
        <trkpt lon="8.0"/>
        <trkpt lat="95" lon="8.0"/>
        <trkpt lat="47.0" lon="190"/>
      </trkseg></trk>`),
    );
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Hausrunde & Hügel → € &bogus;',
        points: [
          { lat: 47, lon: 8, ele: 400.5 },
          { lat: 47.001, lon: 8.001, ele: null },
          { lat: 47.002, lon: 8.002, ele: null },
        ],
      },
    });
  });

  it('falls back to route points, the metadata name and CDATA names', () => {
    const r = parseGpx(gpx('<rte><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2"/></rte>'));
    expect(r.ok && r.value.name).toBe('File');
    const cdata = parseGpx(
      '<gpx><trk><name><![CDATA[Loop]]></name><trkpt lat="1" lon="2"/><trkpt lat="1" lon="3"/></trk></gpx>',
    );
    expect(cdata.ok && cdata.value.name).toBe('Loop');
    const nameless = parseGpx('<gpx><trkpt lat="1" lon="2"/><trkpt lat="1" lon="3"/></gpx>');
    expect(nameless.ok && nameless.value.name).toBeNull();
    const blank = parseGpx(
      '<gpx><trk><name> </name><trkpt lat="1" lon="2"/><trkpt lat="1" lon="3"/></trk></gpx>',
    );
    expect(blank.ok && blank.value.name).toBeNull();
  });

  it('rejects empty, pointless and oversized files', () => {
    const code = (xml: string) => {
      const r = parseGpx(xml);
      return r.ok ? null : r.issues[0]?.code;
    };
    expect(code('  ')).toBe('gpxEmpty');
    expect(code('<gpx><trkpt lat="1" lon="2"/></gpx>')).toBe('gpxNoPoints');
    expect(code('x'.repeat(20_000_001))).toBe('gpxTooLarge');
    expect(code(`<gpx>${'<trkpt lat="1" lon="2"/>'.repeat(200_001)}</gpx>`)).toBe('gpxTooLarge');
  });
});

describe('route profile', () => {
  it('smooths noise and counts gain and loss with hysteresis', () => {
    // 2 km flat with ±1 m GPS noise every 25 m: no gain.
    const noisy = line(2000, (d) => 500 + (Math.round(d / 25) % 2 ? 1 : -1));
    const flat = buildRouteProfile(noisy);
    expect(flat.gainM).toBe(0);
    expect(flat.lossM).toBe(0);
    expect(flat.distanceM).toBe(2000);
    expect(flat.hasElevation).toBe(true);
    expect(flat.track).toHaveLength(2);
    expect(flat.loop).toBe(false);
    expect(flat.climbs).toEqual([]);

    // 1 km up 60 m, 1 km down 60 m.
    const hill = buildRouteProfile(
      line(2000, (d) => (d <= 1000 ? 400 + d * 0.06 : 520 - d * 0.06)),
    );
    expect(hill.gainM).toBeGreaterThan(50);
    expect(hill.lossM).toBeGreaterThan(50);
    expect(hill.gainPerKm).toBeGreaterThan(25);
    expect(hill.climbs).toHaveLength(1);
    expect(hill.climbs[0]?.avgGradient).toBeGreaterThan(0.05);
    expect(hill.climbs[0]?.maxGradient).toBeCloseTo(0.06, 2);
  });

  it('fills missing elevations and copes with none at all', () => {
    const partial = buildRouteProfile(line(1000, (d) => (d === 0 ? 100 : d === 1000 ? 150 : null)));
    expect(partial.profile[20]?.elevationM).toBeCloseTo(125, 0);
    const none = buildRouteProfile(line(1000, () => null));
    expect(none.hasElevation).toBe(false);
    expect(none.gainM).toBe(0);
  });

  it('recognises loops', () => {
    expect(buildRouteProfile(loop(2000, () => 400)).loop).toBe(true);
  });

  it('handles empty and single-point profiles', () => {
    expect(smoothProfile([])).toEqual([]);
    expect(smoothProfile([{ distanceM: 0, elevationM: 5 }])).toEqual([
      { distanceM: 0, elevationM: 5 },
    ]);
    expect(elevationStats([])).toEqual({ distanceM: 0, gainM: 0, lossM: 0, gainPerKm: 0 });
    expect(findClimbs([])).toEqual([]);
  });

  it('finds climbs, short flat bits allowed, and ignores short or gentle ones', () => {
    const profileA: ElevationPoint[] = [
      { distanceM: 0, elevationM: 0 },
      { distanceM: 300, elevationM: 18 }, // 6 %
      { distanceM: 325, elevationM: 18 }, // flat → ends the climb
      { distanceM: 425, elevationM: 30 }, // 12 % but only 100 m
      { distanceM: 1425, elevationM: 50 }, // 2 %: too gentle
      { distanceM: 1425, elevationM: 50 }, // same distance: gradient 0
    ];
    const climbs = findClimbs(profileA);
    expect(climbs).toHaveLength(1);
    expect(climbs[0]).toMatchObject({ startM: 0, endM: 300, gainM: 18, avgGradient: 0.06 });
  });

  it('knows whether a route has a hill-repeat segment (200–400 m at 5–8 %)', () => {
    const good = profileOf(
      line(3000, (d) =>
        d >= 1000 && d < 1300 ? 400 + (d - 1000) * 0.065 : d < 1000 ? 400 : 419.5,
      ),
    );
    expect(hasHillRepeatSegment(good)).toBe(true);
    const steep = profileOf(
      line(3000, (d) => (d >= 1000 && d < 1300 ? 400 + (d - 1000) * 0.15 : d < 1000 ? 400 : 445)),
    );
    expect(hasHillRepeatSegment(steep)).toBe(false);
    expect(hasHillRepeatSegment(flatProfile(3000))).toBe(false);
    expect(hasHillRepeatSegment([])).toBe(false);
  });

  it('builds the profile of a recorded activity from its streams', () => {
    const p = profileFromStreams([0, 500, 1000], [100, 125]);
    expect(p.at(-1)?.distanceM).toBe(500);
  });
});

describe('session on a route', () => {
  const hilly = profileOf(line(10_000, (d) => 400 + 40 * Math.sin(d / 800)));

  it('uses easy pace as a limit for easy runs and the main-set pace for key runs', () => {
    const easy = mainSetFlatPace(easyRun, profile);
    expect(easy).toBeCloseTo(393.75);
    expect(mainSetFlatPace(keyRun, profile)).toBeLessThan(easy);

    const plan = routePacePlan(easyRun, hilly, profile);
    expect(plan.every((s) => !s.pacePrimary)).toBe(true);
    expect(routePacePlan(keyRun, hilly, profile).every((s) => s.pacePrimary)).toBe(true);
  });

  it('derives the main-set pace from targets, hints or the zone', () => {
    const step = (target: Workout['target'], hint?: Workout['target']) => ({
      ...keyRun,
      main: [
        {
          repeat: 1,
          steps: [{ durationSec: 600, zone: 4 as const, target, ...(hint ? { hint } : {}) }],
        },
      ],
    });
    const athletePace = (label: string) =>
      mainSetFlatPace(step({ kind: 'paceZone', value: label }), profile);
    expect(athletePace('T')).toBe(315);
    expect(
      mainSetFlatPace(
        step({ kind: 'hrZone', value: 'Z4' }, { kind: 'paceZone', value: 'I' }),
        profile,
      ),
    ).toBeCloseTo(289.8);
    expect(
      mainSetFlatPace(
        step({ kind: 'hrZone', value: 'Z4' }, { kind: 'hrZone', value: 'Z4' }),
        profile,
      ),
    ).toBe(315);
    expect(mainSetFlatPace(step({ kind: 'hrZone', value: 'Z4' }), profile)).toBe(315);
  });

  it('estimates the session duration on a route (run: GAP, bike: climbing model)', () => {
    const speed = sessionFlatSpeedKmh(easyRun, profile, 'run');
    expect(speed).toBeGreaterThan(8);
    const flat = estimateSessionOnRouteSec(easyRun, 'run', flatProfile(10_000), profile);
    expect(flat).toBeCloseTo((10 / speed) * 3600, 0);
    expect(estimateSessionOnRouteSec(easyRun, 'run', hilly, profile)).toBeGreaterThan(flat);

    // Bike: 10 km flat at 30 km/h = 20 min; a 5 % climb is limited by 700 m/h → 14 km/h.
    expect(estimateBikeRouteDurationSec(flatProfile(10_000), 30, 'intermediate')).toBeCloseTo(1200);
    const climb: ElevationPoint[] = [
      { distanceM: 0, elevationM: 0 },
      { distanceM: 1000, elevationM: 50 },
    ];
    expect(estimateBikeRouteDurationSec(climb, 30, 'intermediate')).toBeCloseTo((1 / 14) * 3600);
    const descent: ElevationPoint[] = [
      { distanceM: 0, elevationM: 50 },
      { distanceM: 1000, elevationM: 0 },
    ];
    // 30 × 1.15 = 34.5 km/h; a steep descent is capped at 45 km/h.
    expect(estimateBikeRouteDurationSec(descent, 30, 'intermediate')).toBeCloseTo(
      (1 / 34.5) * 3600,
    );
    expect(estimateBikeRouteDurationSec(descent, 44, 'intermediate')).toBeCloseTo((1 / 45) * 3600);
    expect(estimateSessionOnRouteSec(ride, 'bike', flatProfile(20_000), profile)).toBeGreaterThan(
      0,
    );
  });
});

describe('route matching', () => {
  const speed = sessionFlatSpeedKmh(easyRun, profile, 'run');
  const fitKm = (speed * easyRun.durationMin) / 60;
  const route = (over: Partial<MatchableRoute> = {}): MatchableRoute => ({
    id: 'r1',
    sport: 'run',
    distanceM: Math.round(fitKm * 1000),
    gainPerKm: easyRun.terrain?.gainPerKm ?? 2,
    profile: flatProfile(Math.round(fitKm * 1000)),
    start: ORIGIN,
    ...over,
  });

  it('scores a route that fits duration, elevation and start at 1', () => {
    const m = scoreRoute(route(), easyRun, profile, ORIGIN);
    expect(m.score).toBe(1);
    expect(m.reasons).toEqual([]);
    expect(scoreRoute(route(), easyRun, profile, null).parts.start).toBe(1);
  });

  it('explains what does not fit', () => {
    const long = scoreRoute(
      route({ profile: flatProfile(fitKm * 2000), gainPerKm: 60, start: at(4000) }),
      easyRun,
      profile,
      ORIGIN,
    );
    expect(long.reasons).toEqual(['tooLong', 'tooHilly', 'farFromStart']);
    expect(long.score).toBeLessThan(0.3);
    const short = scoreRoute(
      route({ profile: flatProfile(fitKm * 300), gainPerKm: 0 }),
      {
        ...easyRun,
        terrain: { gainPerKm: 30, distanceKm: 8, expectedGainM: 240, eccentric: false },
      },
      profile,
      ORIGIN,
    );
    expect(short.reasons).toEqual(['tooShort', 'tooFlat']);
    expect(scoreRoute(route({ sport: 'bike' }), easyRun, profile, ORIGIN)).toMatchObject({
      score: 0,
      reasons: ['wrongSport'],
    });
    // Without planned terrain the session wants flat ground.
    expect(
      scoreRoute(route({ gainPerKm: 2 }), { ...easyRun, terrain: null }, profile, ORIGIN).parts
        .elevation,
    ).toBe(1);
  });

  it('requires a climb for hill sessions', () => {
    const hills: Workout = { ...keyRun, templateId: 'run.hills_short' };
    expect(scoreRoute(route(), hills, profile, ORIGIN).reasons).toEqual(['noClimb']);
    const climbing = profileOf(
      line(6000, (d) =>
        d >= 1000 && d < 1300 ? 400 + (d - 1000) * 0.065 : d < 1000 ? 400 : 419.5,
      ),
    );
    expect(scoreRoute(route({ profile: climbing }), hills, profile, ORIGIN).score).toBeGreaterThan(
      0,
    );

    const bikeHills: Workout = { ...ride, templateId: 'bike.climb' };
    const bikeRoute = route({ sport: 'bike', profile: flatProfile(20_000) });
    expect(scoreRoute(bikeRoute, bikeHills, profile, ORIGIN).reasons).toEqual(['noClimb']);
    const pass = profileOf(line(20_000, (d) => (d < 5000 ? 400 + d * 0.05 : 650)));
    expect(
      scoreRoute({ ...bikeRoute, profile: pass }, bikeHills, profile, ORIGIN).score,
    ).toBeGreaterThan(0);
  });

  it('ranks the best suitable routes first', () => {
    const ranked = rankRoutes(
      [
        route({ id: 'b' }),
        route({ id: 'a' }),
        route({ id: 'far', start: at(3000) }),
        route({ id: 'bike', sport: 'bike' }),
      ],
      easyRun,
      profile,
      ORIGIN,
    );
    expect(ranked.map((m) => m.routeId)).toEqual(['a', 'b', 'far']);
    expect(rankRoutes([route()], swim, profile, ORIGIN)).toEqual([]);
  });

  it('weighs the surface only when it is known', () => {
    expect(scoreRoute(route({ surfaceSuitability: null }), easyRun, profile, ORIGIN).score).toBe(1);
    expect(scoreRoute(route({ surfaceSuitability: 1 }), easyRun, profile, ORIGIN).score).toBe(1);
    const gravel = scoreRoute(route({ surfaceSuitability: 0.2 }), easyRun, profile, ORIGIN);
    expect(gravel.score).toBeCloseTo(1 - 0.3 * 0.8, 5);
    expect(gravel.reasons).toEqual(['badSurface']);
  });
});

describe('generated round trips', () => {
  const flat: Workout = { ...easyRun, terrain: null };

  it('asks for the distance the session takes at its gain per km', () => {
    const speed = sessionFlatSpeedKmh(flat, profile, 'run');
    expect(roundTripDistanceM(flat, profile, 'run')).toBe(
      Math.round(((speed * flat.durationMin) / 60 / (1 + (2 * 8) / 1000)) * 1000),
    );
    const hilly: Workout = {
      ...flat,
      terrain: { gainPerKm: 30, distanceKm: 8, expectedGainM: 240, eccentric: false },
    };
    expect(roundTripDistanceM(hilly, profile, 'run')).toBeLessThan(
      roundTripDistanceM(flat, profile, 'run'),
    );
    const bikeHilly: Workout = {
      ...ride,
      terrain: { gainPerKm: 15, distanceKm: 40, expectedGainM: 600, eccentric: false },
    };
    expect(roundTripDistanceM(bikeHilly, profile, 'bike')).toBeLessThan(
      roundTripDistanceM({ ...ride, terrain: null }, profile, 'bike'),
    );
  });

  it('builds the request with an elevation band, not for swims', () => {
    const r = roundTripRequest(
      { ...flat, terrain: { gainPerKm: 20, distanceKm: 8, expectedGainM: 160, eccentric: false } },
      profile,
      ORIGIN,
    );
    expect(r).toMatchObject({
      start: ORIGIN,
      sport: 'run',
      elevationBand: { minGainPerKm: 15, maxGainPerKm: 25 },
      count: 5,
    });
    expect(roundTripRequest(flat, profile, ORIGIN, 2)?.elevationBand.minGainPerKm).toBe(0);
    expect(roundTripRequest(swim, profile, ORIGIN)).toBeNull();
    expect(roundTripRequest({ ...flat, durationMin: 0 }, profile, ORIGIN)).toBeNull();
  });

  it('picks the best fitting candidates and drops near duplicates', () => {
    const fitM = roundTripDistanceM(flat, profile, 'run');
    const candidate = (id: string, half: number, jitter = 0, surface: number | null = null) => {
      const points = loop(half, () => 400, ORIGIN, jitter);
      return {
        id,
        points,
        distanceM: trackLengthM(points),
        surfaceSuitability: surface,
      } satisfies RoundTripCandidate;
    };
    const picked = pickRoundTrips(
      [
        candidate('fit', fitM / 2),
        candidate('twin', fitM / 2, 5),
        candidate('gravel', fitM / 2, 400, 0),
        candidate('long', fitM * 0.6),
        candidate('far', fitM * 3),
        { id: 'empty', points: [], distanceM: 0, surfaceSuitability: null },
      ],
      flat,
      profile,
      ORIGIN,
    );
    expect(picked.map((p) => p.candidate.id)).toEqual(['fit', 'long', 'gravel']);
    expect(picked[0]?.match.score).toBeGreaterThan(0.9);
    expect(picked[0]?.route.loop).toBe(true);
    expect(pickRoundTrips([candidate('fit', fitM / 2)], swim, profile, ORIGIN)).toEqual([]);
    expect(pickRoundTrips([candidate('fit', fitM / 2)], flat, profile, ORIGIN, 0)).toEqual([]);
  });

  it('turns a candidate into a matchable route', () => {
    const dot = [
      { ...ORIGIN, ele: 400 },
      { ...ORIGIN, ele: 400 },
    ];
    const c: RoundTripCandidate = { id: 'dot', points: dot, distanceM: 0, surfaceSuitability: 1 };
    expect(matchableCandidate(c, 'run', buildRouteProfile(dot))).toMatchObject({
      id: 'dot',
      sport: 'run',
      distanceM: 0,
      gainPerKm: 0,
      surfaceSuitability: 1,
    });
  });

  it('recognises the same track', () => {
    expect(
      sameTrack(
        'run',
        loop(2000, () => 0),
        loop(2000, () => 0, ORIGIN, 5),
      ),
    ).toBe(true);
    expect(
      sameTrack(
        'run',
        loop(2000, () => 0),
        loop(2000, () => 0, ORIGIN, 500),
      ),
    ).toBe(false);
    expect(
      sameTrack(
        'run',
        [],
        loop(2000, () => 0),
      ),
    ).toBe(false);
  });
});

describe('recogniseRoutes', () => {
  let id = 0;
  const track = (points: readonly LatLon[], over: Partial<TrackActivity> = {}): TrackActivity => ({
    key: `strava:${++id}`,
    sport: 'run',
    startTime: `2026-10-${String(10 + id).padStart(2, '0')}T06:00:00Z`,
    indoor: false,
    polyline: encodePolyline(points),
    ...over,
  });

  it('groups the same loop recorded several times and ignores one-offs', () => {
    const a = loop(2000, () => 0);
    const other = loop(2000, () => 0, at(0, 3000));
    const acts = [
      track(a),
      track(loop(2000, () => 0, ORIGIN, 15)),
      track(loop(2000, () => 0, ORIGIN, -10)),
      track(other),
      track(loop(1000, () => 0)), // same start, half the length
      track(a.map((p, i) => (i > 40 ? at(2000 - (i - 41) * 50, 400) : p))), // different way back
      track(a, { sport: 'bike' }),
      track(a, { indoor: true }),
      track(a, { polyline: null }),
      track(a, { sport: 'swim' }),
      track([ORIGIN, ORIGIN]),
    ];
    const routes = recogniseRoutes(acts);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      sport: 'run',
      occurrences: 3,
      representativeKey: acts[2]?.key,
      lastDate: acts[2]?.startTime.slice(0, 10),
    });
    expect(routes[0]?.activityKeys).toEqual([acts[2]?.key, acts[1]?.key, acts[0]?.key]);
    expect(routes[0]?.distanceM).toBeGreaterThan(4000);

    // Already in the library → not suggested again.
    expect(recogniseRoutes(acts, new Set([acts[0]?.key as string]))).toEqual([]);
  });

  it('orders routes by how often they were done, then by date', () => {
    const near = at(0, 5000);
    const x = loop(1500, () => 0, near);
    const same = { startTime: '2026-09-01T06:00:00Z' };
    const routes = recogniseRoutes([
      track(
        loop(2000, () => 0),
        same,
      ),
      track(
        loop(2000, () => 0),
        same,
      ),
      track(x),
      track(x),
      track(x),
    ]);
    expect(routes.map((r) => r.occurrences)).toEqual([3, 2]);
    const tie = recogniseRoutes([
      track(
        loop(2000, () => 0),
        { startTime: '2026-09-01T06:00:00Z' },
      ),
      track(
        loop(2000, () => 0),
        { startTime: '2026-09-02T06:00:00Z' },
      ),
      track(x, { startTime: '2026-09-05T06:00:00Z' }),
      track(x, { startTime: '2026-09-05T06:00:00Z' }),
    ]);
    expect(tie.map((r) => r.lastDate)).toEqual(['2026-09-05', '2026-09-02']);
  });
});

describe('evaluateActivity', () => {
  const zones = (() => {
    const r = calculateHrZones({ age: 35 });
    if (!r.ok) throw new Error('zones');
    return r.value.zones;
  })();

  /** 3.2 km run: 1 km flat at 5:00, 1 km up 6 % at 6:00, 1 km down at 4:50, 200 m flat. */
  function stream(): ActivityStream {
    const s: ActivityStream = { distanceM: [], timeS: [], altitudeM: [], heartrate: [] };
    let t = 0;
    for (let d = 0; d <= 3200; d += 25) {
      const pace = d <= 1000 ? 300 : d <= 2000 ? 360 : d <= 3000 ? 290 : 300;
      if (d > 0) t += (25 / 1000) * pace;
      s.distanceM.push(d);
      s.timeS.push(Math.round(t * 10) / 10);
      s.altitudeM.push(
        d <= 1000
          ? 400
          : d <= 2000
            ? 400 + (d - 1000) * 0.06
            : d <= 3000
              ? 460 - (d - 2000) * 0.06
              : 400,
      );
      s.heartrate?.push(d <= 1000 ? 120 : 140);
    }
    return s;
  }

  it('evaluates each km grade-adjusted against the plan', () => {
    const e = evaluateActivity('run', stream(), {
      plan: { flatPaceSecPerKm: 300, pacePrimary: true },
      targetZone: 2,
      hrZones: zones,
    });
    expect(e).not.toBeNull();
    const km = e?.km ?? [];
    expect(km.map((k) => k.km)).toEqual([1, 2, 3, 4]);
    expect(km[0]).toMatchObject({ paceSecPerKm: 300, verdict: 'inRange', avgHr: 120 });
    expect(km[0]?.gapSecPerKm).toBeCloseTo(300, -1);
    // Uphill: slower actual pace, but the GAP is faster than 6:00.
    expect(km[1]?.paceSecPerKm).toBe(360);
    expect(km[1]?.gapSecPerKm).toBeLessThan(300);
    expect(km[1]?.plannedSecPerKm).toBeGreaterThan(300);
    expect(km[1]?.verdict).toBe('faster');
    expect(km[3]?.endM).toBe(3200);
    expect(e?.gainM).toBeGreaterThan(50);
    expect(e?.durationSec).toBeGreaterThan(900);
    expect(e?.gapSecPerKm).toBeGreaterThan(250);
    expect(e?.timeInZoneSec).toBe(300);
    expect(e?.timeInZoneShare).toBeCloseTo(0.3, 1);
  });

  it('flags slow kms only when pace is the target', () => {
    const slow = evaluateActivity('run', stream(), {
      plan: { flatPaceSecPerKm: 250, pacePrimary: true },
    });
    expect(slow?.km[0]?.verdict).toBe('slower');
    const limit = evaluateActivity('run', stream(), {
      plan: { flatPaceSecPerKm: 250, pacePrimary: false },
    });
    expect(limit?.km[0]?.verdict).toBe('inRange');
  });

  it('works without plan, heart rate or for rides', () => {
    const s = { ...stream(), heartrate: null };
    const plain = evaluateActivity('run', s);
    expect(plain?.km[0]).toMatchObject({ plannedSecPerKm: null, verdict: null, avgHr: null });
    expect(plain?.timeInZoneSec).toBeNull();
    const bike = evaluateActivity('bike', stream(), {
      plan: { flatPaceSecPerKm: 300, pacePrimary: true },
      targetZone: 2,
      hrZones: zones,
    });
    expect(bike?.gapSecPerKm).toBeNull();
    expect(bike?.km[0]).toMatchObject({ gapSecPerKm: null, verdict: null, speedKmh: 12 });
    // No HR at all: no time in zone.
    expect(
      evaluateActivity(
        'run',
        { ...s, heartrate: s.distanceM.map(() => 0) },
        { targetZone: 2, hrZones: zones },
      )?.timeInZoneSec,
    ).toBeNull();
  });

  it('skips pauses, repeated samples and a tiny last km', () => {
    const s: ActivityStream = {
      distanceM: [0, 500, 500, 1000, 1000, 1050],
      timeS: [0, 150, 160, 310, 310, 330],
      altitudeM: [0, 0, 0, 0, 0, 0],
      heartrate: null,
    };
    const e = evaluateActivity('run', s);
    expect(e?.km).toHaveLength(1);
    expect(e?.km[0]?.durationSec).toBe(300);
    expect(
      evaluateActivity('run', { distanceM: [0], timeS: [0], altitudeM: [0], heartrate: null }),
    ).toBeNull();
  });
});

describe('learnTerrainProfile', () => {
  const sample = (over: object = {}) => ({
    sport: 'run',
    date: '2026-10-10',
    indoor: false,
    distanceM: 10_000,
    elevationGainM: 200,
    ...over,
  });

  it('classifies gain per km into the closest home terrain', () => {
    expect(classifyTerrain('run', 0)).toBe('flat');
    expect(classifyTerrain('run', 12)).toBe('rolling');
    expect(classifyTerrain('run', 22)).toBe('hilly');
    expect(classifyTerrain('run', 50)).toBe('mountainous');
    expect(classifyTerrain('bike', 12)).toBe('hilly');
  });

  it('learns gain per km and typical climbs from recent outdoor activities', () => {
    const climb = profileOf(line(2000, (d) => 400 + d * 0.05));
    const learned = learnTerrainProfile(
      [
        sample(),
        sample({ elevationGainM: 100, profile: climb }),
        sample({ elevationGainM: 300, profile: null }),
        sample({
          elevationGainM: 1,
          distanceM: 1,
          profile: profileOf(line(1000, (d) => 400 + d * 0.04)),
        }),
        sample({ sport: 'bike', distanceM: 40_000, elevationGainM: 240 }),
        sample({ indoor: true }),
        sample({ sport: 'swim' }),
        sample({ distanceM: null }),
        sample({ elevationGainM: null }),
        sample({ date: '2026-06-01' }),
        sample({ date: '2026-12-01' }),
        sample({ date: 'nope' }),
      ],
      '2026-10-20',
    );
    expect(learned).toMatchObject({
      terrain: 'hilly',
      activities: 5,
      sports: [
        { sport: 'run', activities: 4, gainPerKm: 20, terrain: 'hilly' },
        { sport: 'bike', activities: 1, gainPerKm: 6, terrain: 'rolling' },
      ],
    });
    expect(learned?.climbs.map((c) => c.gainM)).toEqual([98, 39]);
  });

  it('needs a few activities and uses bike when there are no runs', () => {
    expect(learnTerrainProfile([sample(), sample()], '2026-10-20')).toBeNull();
    const bike = sample({ sport: 'bike', distanceM: 40_000, elevationGainM: 800 });
    expect(learnTerrainProfile([bike, bike, bike], '2026-10-20')?.terrain).toBe('mountainous');
  });
});

describe('setWorkoutRoute', () => {
  it('stores and clears the chosen route of a run or ride', () => {
    const r = setWorkoutRoute(state, easyRun.id, 'route-1');
    expect(r.ok).toBe(true);
    const withRoute = r.ok ? r.value : state;
    expect(allWorkouts(withRoute.plan).find((w) => w.id === easyRun.id)?.routeId).toBe('route-1');
    const cleared = setWorkoutRoute(withRoute, easyRun.id, null);
    const w = cleared.ok ? allWorkouts(cleared.value.plan).find((x) => x.id === easyRun.id) : null;
    expect(w && 'routeId' in w).toBe(false);
  });

  it('works for rides too', () => {
    expect(setWorkoutRoute(state, ride.id, 'route-2').ok).toBe(true);
  });

  it('rejects unknown workouts and sports without routes', () => {
    expect(setWorkoutRoute(state, 'nope', 'r')).toMatchObject({ ok: false });
    const swimState: PlanState = {
      ...state,
      plan: {
        ...state.plan,
        weeks: state.plan.weeks.map((w) => ({
          ...w,
          workouts: w.workouts.map((x) =>
            x.id === easyRun.id ? { ...x, sport: 'swim' as const } : x,
          ),
        })),
      },
    };
    expect(setWorkoutRoute(swimState, easyRun.id, 'r')).toMatchObject({
      ok: false,
      issues: [{ code: 'noRoute' }],
    });
  });
});
