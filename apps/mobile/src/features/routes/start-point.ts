import type { LatLon } from '@peakr/engine';

/**
 * The user's home start point (CLAUDE.md "Terrain intelligence": route options "from the user's
 * start point"). Entered as coordinates – e.g. copied from a map app – or taken from the start of
 * a library route.
 */

/** "47.3769, 8.5417" (comma, semicolon or space separated; decimal degrees) → point, or null. */
export function parseLatLon(input: string): LatLon | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(input);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Five decimals ≈ 1 m – enough for a start point, short enough to read. */
export function formatLatLon(p: LatLon): string {
  const r = (n: number) => String(Math.round(n * 1e5) / 1e5);
  return `${r(p.lat)}, ${r(p.lon)}`;
}
