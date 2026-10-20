/**
 * Geometry on GPS tracks: distances, Google encoded polylines, simplification and the normalised
 * shape used for route thumbnails (CLAUDE.md "UI patterns" → Progress history). Pure and
 * deterministic; distances in metres on a spherical earth.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function haversineM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distance along a track, starting at 0. */
export function cumulativeDistances(points: readonly LatLon[]): number[] {
  const out: number[] = [];
  let total = 0;
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev) total += haversineM(prev, p);
    out.push(total);
  });
  return out;
}

export function trackLengthM(points: readonly LatLon[]): number {
  return cumulativeDistances(points).at(-1) ?? 0;
}

/** Decodes a Google encoded polyline (precision 5 by default). Invalid input ends the decode. */
export function decodePolyline(encoded: string, precision = 5): LatLon[] {
  const factor = 10 ** precision;
  const points: LatLon[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (index >= encoded.length) return null;
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) break;
    }
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    const dLat = next();
    const dLon = next();
    if (dLat === null || dLon === null) break;
    lat += dLat;
    lon += dLon;
    points.push({ lat: lat / factor, lon: lon / factor });
  }
  return points;
}

export function encodePolyline(points: readonly LatLon[], precision = 5): string {
  const factor = 10 ** precision;
  let out = '';
  let prevLat = 0;
  let prevLon = 0;
  const encode = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * factor);
    const lon = Math.round(p.lon * factor);
    encode(lat - prevLat);
    encode(lon - prevLon);
    prevLat = lat;
    prevLon = lon;
  }
  return out;
}

/** Local planar coordinates in metres around a reference latitude (fine for a single route). */
function projector(refLat: number) {
  const kx = (Math.PI / 180) * EARTH_RADIUS_M * Math.cos(rad(refLat));
  const ky = (Math.PI / 180) * EARTH_RADIUS_M;
  return (p: LatLon) => ({ x: p.lon * kx, y: p.lat * ky });
}

function segmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Douglas–Peucker simplification with a tolerance in metres. Keeps first and last point and the
 * extra fields of the kept points (e.g. elevation).
 */
export function simplifyTrack<T extends LatLon>(points: readonly T[], toleranceM: number): T[] {
  if (points.length <= 2) return [...points];
  const project = projector((points[0] as T).lat);
  const xy = points.map(project);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let maxDist = 0;
    let maxIndex = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(at(xy, i), at(xy, first), at(xy, last));
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }
    if (maxIndex !== -1 && maxDist > toleranceM) {
      keep[maxIndex] = 1;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

export interface BBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function boundingBox(points: readonly LatLon[]): BBox | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Track scaled into a `size × size` box (y down, aspect ratio kept, centred, `padding` on each
 * side) – the route thumbnail without map tiles. Empty for fewer than 2 points.
 */
export function normalizeTrack(
  points: readonly LatLon[],
  size: number,
  padding = 0,
): { x: number; y: number }[] {
  if (points.length < 2) return [];
  const box = boundingBox(points) as BBox;
  const project = projector((box.minLat + box.maxLat) / 2);
  const xy = points.map(project);
  const xs = xy.map((p) => p.x);
  const ys = xy.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const width = Math.max(...xs) - minX;
  const height = maxY - Math.min(...ys);
  const inner = size - 2 * padding;
  const scale = Math.max(width, height) === 0 ? 0 : inner / Math.max(width, height);
  const offsetX = padding + (inner - width * scale) / 2;
  const offsetY = padding + (inner - height * scale) / 2;
  return xy.map((p) => ({
    x: round2(offsetX + (p.x - minX) * scale),
    y: round2(offsetY + (maxY - p.y) * scale),
  }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Index known to be in range (keeps `noUncheckedIndexedAccess` without `!`). */
function at<T>(list: readonly T[], i: number): T {
  return list[i] as T;
}

/** Points at equal distances along a track (`count` ≥ 2), first and last included. */
export function resampleTrack(points: readonly LatLon[], count: number): LatLon[] {
  if (points.length === 0) return [];
  // Total 0 covers a single point, so `j + 1` below is always a valid index.
  const dist = cumulativeDistances(points);
  const total = dist.at(-1) as number;
  if (total === 0) return Array.from({ length: count }, () => ({ ...(points[0] as LatLon) }));
  const out: LatLon[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (j < dist.length - 2 && (dist[j + 1] as number) < target) j++;
    const a = at(points, j);
    const b = at(points, j + 1);
    const start = at(dist, j);
    const span = Math.max(at(dist, j + 1) - start, 1e-9);
    const t = Math.min(1, Math.max(0, (target - start) / span));
    out.push({ lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) });
  }
  return out;
}
