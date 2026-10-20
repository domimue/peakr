import { planConfig } from '../plan/config';
import { elevationAt, type ElevationPoint } from '../plan/terrain';
import { cumulativeDistances, haversineM, simplifyTrack, type LatLon } from './geo';
import type { GpxPoint } from './gpx';

/**
 * Elevation profile of a route or a recorded activity: resampled to a fixed spacing, smoothed
 * (GPS / barometer noise), gain and loss with hysteresis, and the climbs on it
 * (CLAUDE.md "Terrain intelligence" → route matching, per-km pace plan, evaluation).
 */

const cfg = planConfig.routes;

export interface Climb {
  startM: number;
  endM: number;
  gainM: number;
  /** Average gradient as a fraction (0.06 = 6 %). */
  avgGradient: number;
  /** Steepest 100 m inside the climb. */
  maxGradient: number;
}

export interface ElevationStats {
  distanceM: number;
  gainM: number;
  lossM: number;
  /** Gain per km of distance. */
  gainPerKm: number;
}

/** A route ready for the library: smoothed profile, simplified track, stats and climbs. */
export interface RouteProfile extends ElevationStats {
  /** False when the source had no elevation at all (the profile is then flat at 0). */
  hasElevation: boolean;
  /** Smoothed elevation every `profileStepM`. */
  profile: ElevationPoint[];
  /** Simplified track for the map and the thumbnail. */
  track: LatLon[];
  start: LatLon;
  end: LatLon;
  /** Start and finish within the recognition start radius. */
  loop: boolean;
  climbs: Climb[];
}

/** Resamples raw points to the profile spacing and smooths them with a moving average. */
export function smoothProfile(raw: readonly ElevationPoint[]): ElevationPoint[] {
  const total = raw.at(-1)?.distanceM ?? 0;
  if (raw.length === 0) return [];
  const step = cfg.profileStepM;
  const grid: ElevationPoint[] = [];
  for (let d = 0; d < total; d += step)
    grid.push({ distanceM: d, elevationM: elevationAt(raw, d) });
  grid.push({ distanceM: total, elevationM: elevationAt(raw, total) });
  const half = Math.max(1, Math.round(cfg.smoothingWindowM / step / 2));
  return grid.map((p, i) => {
    const window = grid.slice(Math.max(0, i - half), i + half + 1);
    const avg = window.reduce((sum, w) => sum + w.elevationM, 0) / window.length;
    return { distanceM: p.distanceM, elevationM: Math.round(avg * 10) / 10 };
  });
}

/** Distance, gain and loss of a (smoothed) profile; changes below the hysteresis are noise. */
export function elevationStats(profile: readonly ElevationPoint[]): ElevationStats {
  let gain = 0;
  let loss = 0;
  let ref = profile[0]?.elevationM ?? 0;
  for (const p of profile) {
    const diff = p.elevationM - ref;
    if (Math.abs(diff) < cfg.gainHysteresisM) continue;
    if (diff > 0) gain += diff;
    else loss -= diff;
    ref = p.elevationM;
  }
  const distanceM = profile.at(-1)?.distanceM ?? 0;
  return {
    distanceM: Math.round(distanceM),
    gainM: Math.round(gain),
    lossM: Math.round(loss),
    gainPerKm: distanceM > 0 ? Math.round((gain / (distanceM / 1000)) * 10) / 10 : 0,
  };
}

const gradeBetween = (a: ElevationPoint, b: ElevationPoint) =>
  b.distanceM === a.distanceM ? 0 : (b.elevationM - a.elevationM) / (b.distanceM - a.distanceM);

/** Steepest gradient over ~100 m inside [startM, endM]. */
function maxGradientIn(profile: readonly ElevationPoint[], startM: number, endM: number): number {
  const window = Math.min(100, endM - startM);
  let max = 0;
  for (let d = startM; d + window <= endM + 1e-9; d += cfg.profileStepM) {
    const g = (elevationAt(profile, d + window) - elevationAt(profile, d)) / window;
    max = Math.max(max, g);
  }
  return Math.round(max * 1000) / 1000;
}

/**
 * Climbs: rising sections (short flat bits allowed) at least `climb.minLengthM` long with an
 * average gradient of at least `climb.minGradient`.
 */
export function findClimbs(profile: readonly ElevationPoint[]): Climb[] {
  const climbs: Climb[] = [];
  let start = -1;
  const close = (endIndex: number) => {
    const a = profile[start] as ElevationPoint;
    const b = profile[endIndex] as ElevationPoint;
    const length = b.distanceM - a.distanceM;
    const avg = gradeBetween(a, b);
    if (length >= cfg.climb.minLengthM && avg >= cfg.climb.minGradient) {
      climbs.push({
        startM: Math.round(a.distanceM),
        endM: Math.round(b.distanceM),
        gainM: Math.round(b.elevationM - a.elevationM),
        avgGradient: Math.round(avg * 1000) / 1000,
        maxGradient: maxGradientIn(profile, a.distanceM, b.distanceM),
      });
    }
    start = -1;
  };
  for (let i = 1; i < profile.length; i++) {
    const rising =
      gradeBetween(profile[i - 1] as ElevationPoint, profile[i] as ElevationPoint) > 0.01;
    if (rising && start === -1) start = i - 1;
    if (!rising && start !== -1) close(i - 1);
  }
  if (start !== -1) close(profile.length - 1);
  return climbs;
}

/**
 * Whether the profile has a section suitable for hill repeats: 200–400 m at 5–8 % average, steady
 * (no flat start or steep wall inside) – CLAUDE.md "Route matching": hill sessions need a
 * matching climb segment.
 */
export function hasHillRepeatSegment(profile: readonly ElevationPoint[]): boolean {
  const h = cfg.hillClimb;
  const total = profile.at(-1)?.distanceM ?? 0;
  const grade = (from: number, len: number) =>
    (elevationAt(profile, from + len) - elevationAt(profile, from)) / len;
  const steady = (from: number, len: number) => {
    for (let p = from; p + h.pieceM <= from + len; p += h.pieceM) {
      const g = grade(p, h.pieceM);
      if (g < h.pieceMinGradient || g > h.pieceMaxGradient) return false;
    }
    return true;
  };
  for (let len = h.minLengthM; len <= h.maxLengthM; len += cfg.profileStepM) {
    for (let d = 0; d + len <= total; d += cfg.profileStepM) {
      const g = grade(d, len);
      if (g >= h.minGradient && g <= h.maxGradient && steady(d, len)) return true;
    }
  }
  return false;
}

/** Fills missing elevations by interpolating between known neighbours (edges: nearest known). */
function fillElevation(points: readonly GpxPoint[], dist: readonly number[]): number[] | null {
  const known = points.flatMap((p, i) =>
    p.ele === null ? [] : [{ distanceM: dist[i] as number, elevationM: p.ele }],
  );
  if (known.length === 0) return null;
  return points.map((p, i) => p.ele ?? elevationAt(known, dist[i] as number));
}

/** Library route from imported points (GPX, a recognised activity track). Needs ≥ 2 points. */
export function buildRouteProfile(points: readonly GpxPoint[]): RouteProfile {
  const dist = cumulativeDistances(points);
  const elevations = fillElevation(points, dist);
  const raw = points.map((_, i) => ({
    distanceM: dist[i] as number,
    elevationM: elevations?.[i] ?? 0,
  }));
  const profile = smoothProfile(raw);
  const start = points[0] as GpxPoint;
  const end = points.at(-1) as GpxPoint;
  return {
    ...elevationStats(profile),
    hasElevation: elevations !== null,
    profile,
    track: simplifyTrack(points, cfg.simplifyToleranceM).map(({ lat, lon }) => ({ lat, lon })),
    start: { lat: start.lat, lon: start.lon },
    end: { lat: end.lat, lon: end.lon },
    loop: haversineM(start, end) <= cfg.recognition.startRadiusM,
    climbs: findClimbs(profile),
  };
}

/** Profile of a recorded activity from its distance and altitude streams (same length). */
export function profileFromStreams(
  distanceM: readonly number[],
  altitudeM: readonly number[],
): ElevationPoint[] {
  const raw = distanceM.flatMap((d, i) => {
    const e = altitudeM[i];
    return e === undefined ? [] : [{ distanceM: d, elevationM: e }];
  });
  return smoothProfile(raw);
}
