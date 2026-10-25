/**
 * Generated round trips (CLAUDE.md "Terrain intelligence" §2b, Phase 8b) – the pure part: request
 * snapping for the cache, OpenRouteService request and response mapping, surface suitability,
 * swisstopo elevation profile mapping. Pure TypeScript without Deno or engine imports, so the same
 * file runs in Deno and in Node (`packages/routing` tests it). The candidate shape matches
 * `RoundTripCandidate` in `@peakr/engine` (`route/routing.ts`).
 */

export type RouteSport = 'run' | 'bike';

export interface RoutePoint {
  lat: number;
  lon: number;
  ele: number | null;
}

export interface RoundTripCandidate {
  id: string;
  points: RoutePoint[];
  distanceM: number;
  surfaceSuitability: number | null;
}

export type ElevationSource = 'swisstopo' | 'ors';

export interface RoundTripResponse {
  provider: 'openrouteservice';
  elevation: ElevationSource;
  candidates: RoundTripCandidate[];
}

export interface RoundTripQuery {
  lat: number;
  lon: number;
  sport: RouteSport;
  targetDistanceM: number;
  count: number;
  /** Desired gain per km (centre of the band); picks a hiking profile for hilly runs. */
  gainPerKm: number;
}

export const routingConfig = {
  /** Start snapped to ~100 m: cache hits for the same home, and no exact address stored. */
  startGridDeg: 0.001,
  /** Target distance snapped to this step (the distance is approximate anyway). */
  distanceStepM: 500,
  minDistanceM: 2000,
  /** OpenRouteService limits round trips; keep well below it. */
  maxDistanceM: 100_000,
  maxCount: 6,
  /** Round-trip shape: more points make rounder loops. */
  roundTripPoints: 4,
  /** A result this far off the target length is requested once more with a corrected length. */
  retryDeviation: 0.2,
  /** Runs on hillier sessions use the hiking profile (trails, steeper paths). */
  hikingFromGainPerKm: 20,
  /** Points closer than this to the previous kept one are dropped from the response. */
  thinM: 8,
  /** Generations (cache misses) per user and day – protects the provider's free quota. */
  dailyLimit: 20,
  /** Cache rows are kept this long. */
  cacheDays: 14,
  /** swisstopo profile: one sample per this many metres, within these bounds. */
  swissSampleM: 20,
  swissMinSamples: 200,
  swissMaxSamples: 1000,
  /** Coordinates sent to swisstopo are thinned to at most this many. */
  swissMaxCoordinates: 1000,
} as const;

const cfg = routingConfig;

export function parseRoundTripQuery(body: unknown): RoundTripQuery | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const { lat, lon, sport, targetDistanceM, count, gainPerKm } = b;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (sport !== 'run' && sport !== 'bike') return null;
  if (!finite(targetDistanceM) || targetDistanceM <= 0) return null;
  return {
    lat,
    lon,
    sport,
    targetDistanceM,
    count: finite(count) ? Math.round(count) : 5,
    gainPerKm: finite(gainPerKm) && gainPerKm >= 0 ? gainPerKm : 0,
  };
}

const snap = (value: number, step: number) =>
  Math.round(Math.round(value / step) * step * 1e6) / 1e6;

/** The query as it is generated and cached: start on the grid, distance stepped, count bounded. */
export function snapQuery(q: RoundTripQuery): RoundTripQuery {
  return {
    lat: snap(q.lat, cfg.startGridDeg),
    lon: snap(q.lon, cfg.startGridDeg),
    sport: q.sport,
    targetDistanceM: Math.min(
      cfg.maxDistanceM,
      Math.max(cfg.minDistanceM, snap(q.targetDistanceM, cfg.distanceStepM)),
    ),
    count: Math.min(cfg.maxCount, Math.max(1, q.count)),
    gainPerKm: q.gainPerKm,
  };
}

export type OrsProfile = 'foot-walking' | 'foot-hiking' | 'cycling-road';

export function orsProfile(q: Pick<RoundTripQuery, 'sport' | 'gainPerKm'>): OrsProfile {
  if (q.sport === 'bike') return 'cycling-road';
  return q.gainPerKm >= cfg.hikingFromGainPerKm ? 'foot-hiking' : 'foot-walking';
}

/** Cache key of a snapped query (one row per user and key). */
export function cacheKey(q: RoundTripQuery): string {
  return [
    'ors',
    orsProfile(q),
    q.lat.toFixed(3),
    q.lon.toFixed(3),
    q.targetDistanceM,
    q.count,
  ].join(':');
}

/** Body for `POST /v2/directions/{profile}/geojson`. */
export function orsRoundTripBody(q: RoundTripQuery, seed: number, lengthM: number) {
  return {
    coordinates: [[q.lon, q.lat]],
    options: {
      round_trip: { length: Math.round(lengthM), points: cfg.roundTripPoints, seed },
    },
    elevation: true,
    extra_info: ['surface'],
    instructions: false,
  };
}

interface OrsSurfaceSummary {
  value?: number;
  distance?: number;
}

export interface OrsGeoJson {
  features?: {
    geometry?: { coordinates?: number[][] };
    properties?: {
      summary?: { distance?: number };
      extras?: { surface?: { summary?: OrsSurfaceSummary[] } };
    };
  }[];
}

/**
 * OpenRouteService surface codes (extra_info "surface"). Road bikes want a sealed surface; runs
 * accept almost anything but ice and sand. 0 = unknown and is left out.
 */
const PAVED = new Set([1, 3, 4, 6, 7, 14]);
const UNRUNNABLE = new Set([13, 15]);

export function surfaceSuitability(
  sport: RouteSport,
  summary: readonly OrsSurfaceSummary[] | undefined,
): number | null {
  let known = 0;
  let suitable = 0;
  for (const s of summary ?? []) {
    const d = typeof s.distance === 'number' && s.distance > 0 ? s.distance : 0;
    if (typeof s.value !== 'number' || s.value === 0 || d === 0) continue;
    known += d;
    const ok = sport === 'bike' ? PAVED.has(s.value) : !UNRUNNABLE.has(s.value);
    if (ok) suitable += d;
  }
  return known === 0 ? null : Math.round((suitable / known) * 100) / 100;
}

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Drops points closer than `minM` to the previous kept one; first and last always stay. */
export function thinPoints<T extends { lat: number; lon: number }>(
  points: readonly T[],
  minM: number,
): T[] {
  if (points.length <= 2) return [...points];
  const out: T[] = [points[0] as T];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i] as T;
    if (distanceM(out[out.length - 1] as T, p) >= minM) out.push(p);
  }
  out.push(points[points.length - 1] as T);
  return out;
}

/** Every n-th point so that at most `max` remain (first and last kept). */
export function capPoints<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return [...points];
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)] as T);
}

/** One OpenRouteService round trip as a candidate; null when the response has no usable route. */
export function mapOrsRoundTrip(
  body: OrsGeoJson,
  sport: RouteSport,
  id: string,
): RoundTripCandidate | null {
  const feature = body.features?.[0];
  const coordinates = feature?.geometry?.coordinates ?? [];
  const points: RoutePoint[] = coordinates.flatMap((c) => {
    const [lon, lat, ele] = c;
    if (typeof lat !== 'number' || typeof lon !== 'number') return [];
    return [{ lat, lon, ele: typeof ele === 'number' && Number.isFinite(ele) ? ele : null }];
  });
  if (points.length < 2) return null;
  let length = feature?.properties?.summary?.distance;
  if (typeof length !== 'number' || !(length > 0)) {
    length = points.reduce(
      (sum, p, i) => (i === 0 ? 0 : sum + distanceM(points[i - 1] as RoutePoint, p)),
      0,
    );
  }
  return {
    id,
    points: thinPoints(points, cfg.thinM),
    distanceM: Math.round(length),
    surfaceSuitability: surfaceSuitability(sport, feature?.properties?.extras?.surface?.summary),
  };
}

/** Length to ask for once more when a result missed the target by more than `retryDeviation`. */
export function correctedLength(
  targetM: number,
  requestedM: number,
  actualM: number,
): number | null {
  if (actualM <= 0 || Math.abs(actualM - targetM) / targetM <= cfg.retryDeviation) return null;
  return Math.round(
    Math.min(cfg.maxDistanceM, Math.max(cfg.minDistanceM, requestedM * (targetM / actualM))),
  );
}

/** Which of two attempts is closer to the target length. */
export function closer(
  targetM: number,
  a: RoundTripCandidate,
  b: RoundTripCandidate | null,
): RoundTripCandidate {
  if (!b) return a;
  return Math.abs(b.distanceM - targetM) < Math.abs(a.distanceM - targetM) ? b : a;
}

// ---------------------------------------------------------------------------------------------
// swisstopo elevation (swissALTI3D / DHM25 via the GeoAdmin profile service), Switzerland only.

/** Switzerland and Liechtenstein as a box. */
const SWISS_BOX = { latMin: 45.8, latMax: 47.85, lonMin: 5.9, lonMax: 10.55 };

export function inSwitzerland(p: { lat: number; lon: number }): boolean {
  return (
    p.lat >= SWISS_BOX.latMin &&
    p.lat <= SWISS_BOX.latMax &&
    p.lon >= SWISS_BOX.lonMin &&
    p.lon <= SWISS_BOX.lonMax
  );
}

/**
 * WGS84 → Swiss LV95 (E, N) with swisstopo's approximate formulas (about 1 m accuracy, plenty
 * for an elevation lookup).
 */
export function toLv95(p: { lat: number; lon: number }): [number, number] {
  const phi = (p.lat * 3600 - 169028.66) / 10000;
  const lambda = (p.lon * 3600 - 26782.5) / 10000;
  const e =
    2600072.37 +
    211455.93 * lambda -
    10938.51 * lambda * phi -
    0.36 * lambda * phi ** 2 -
    44.54 * lambda ** 3;
  const n =
    1200147.07 +
    308807.95 * phi +
    3745.25 * lambda ** 2 +
    76.63 * phi ** 2 -
    194.56 * lambda ** 2 * phi +
    119.79 * phi ** 3;
  return [Math.round(e * 100) / 100, Math.round(n * 100) / 100];
}

/** GeoJSON LineString in LV95 and the sample count for the profile request. */
export function swissProfileRequest(points: readonly RoutePoint[], lengthM: number) {
  const coordinates = capPoints(points, cfg.swissMaxCoordinates).map(toLv95);
  const samples = Math.min(
    cfg.swissMaxSamples,
    Math.max(cfg.swissMinSamples, Math.round(lengthM / cfg.swissSampleM)),
  );
  return { geom: { type: 'LineString', coordinates }, samples };
}

export interface SwissProfilePoint {
  dist?: number;
  alts?: { COMB?: number | null; DTM2?: number | null; DTM25?: number | null };
}

/**
 * Elevation of every route point from the swisstopo profile: the profile is sampled along the
 * same line, so each point takes the interpolated height at its share of the route length.
 * Points the profile does not cover (outside Switzerland) keep their global DEM height.
 */
export function applySwissProfile(
  points: readonly RoutePoint[],
  profile: readonly SwissProfilePoint[],
): RoutePoint[] | null {
  const samples = profile.flatMap((s) => {
    const alt = s.alts?.COMB ?? s.alts?.DTM2 ?? s.alts?.DTM25;
    return typeof s.dist === 'number' && typeof alt === 'number' && Number.isFinite(alt) && alt > 0
      ? [{ dist: s.dist, alt }]
      : [];
  });
  const profileLength = profile.at(-1)?.dist;
  if (samples.length < 2 || typeof profileLength !== 'number' || profileLength <= 0) return null;
  const spacing = profileLength / Math.max(1, profile.length - 1);
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      (cumulative[i - 1] as number) +
        distanceM(points[i - 1] as RoutePoint, points[i] as RoutePoint),
    );
  }
  const total = cumulative.at(-1) as number;
  const first = samples[0] as { dist: number; alt: number };
  const last = samples.at(-1) as { dist: number; alt: number };
  let j = 0;
  return points.map((p, i) => {
    const d = total > 0 ? ((cumulative[i] as number) / total) * profileLength : 0;
    // Outside the sampled (covered) stretch: keep the global DEM height.
    if (d < first.dist - cfg.swissSampleM || d > last.dist + cfg.swissSampleM) return { ...p };
    while (j < samples.length - 2 && (samples[j + 1] as { dist: number }).dist < d) j++;
    const a = samples[j] as { dist: number; alt: number };
    const b = samples[j + 1] as { dist: number; alt: number };
    // A gap in the samples (the line left Switzerland in between): keep the global DEM height.
    if (b.dist - a.dist > 3 * spacing) return { ...p };
    const t = b.dist > a.dist ? Math.max(0, Math.min(1, (d - a.dist) / (b.dist - a.dist))) : 0;
    return { ...p, ele: Math.round((a.alt + t * (b.alt - a.alt)) * 10) / 10 };
  });
}
