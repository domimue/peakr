/**
 * Robust statistics for values derived from real-world data (Strava baseline). All functions
 * return `null` for an empty input instead of a misleading number.
 */

function sorted(xs: readonly number[]): number[] {
  return xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
}

/** Quantile with linear interpolation (q in 0…1). */
export function quantile(xs: readonly number[], q: number): number | null {
  const s = sorted(xs);
  if (s.length === 0) return null;
  const pos = Math.min(1, Math.max(0, q)) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = s[lo] as number;
  const b = s[hi] as number;
  return a + (b - a) * (pos - lo);
}

export function median(xs: readonly number[]): number | null {
  return quantile(xs, 0.5);
}

/**
 * Mean after dropping `trim` (0…0.5) of the values at each end. With few values at least the
 * middle value stays, so the result never becomes undefined for a non-empty input.
 */
export function trimmedMean(xs: readonly number[], trim = 0.2): number | null {
  const s = sorted(xs);
  if (s.length === 0) return null;
  const cut = Math.min(
    Math.floor(s.length * Math.min(0.5, Math.max(0, trim))),
    (s.length - 1) >> 1,
  );
  const kept = s.slice(cut, s.length - cut);
  return kept.reduce((sum, x) => sum + x, 0) / kept.length;
}

/** Median absolute deviation (unscaled). */
export function mad(xs: readonly number[]): number | null {
  const m = median(xs);
  if (m === null) return null;
  return median(xs.filter((x) => Number.isFinite(x)).map((x) => Math.abs(x - m)));
}

/**
 * Theil–Sen line fit: slope = median of all pairwise slopes, intercept = median of y − slope·x.
 * Robust against a few outliers; `null` with fewer than two distinct x values.
 */
export function theilSen(
  points: readonly { x: number; y: number }[],
): { slope: number; intercept: number } | null {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i] as { x: number; y: number };
      const b = points[j] as { x: number; y: number };
      if (a.x !== b.x) slopes.push((b.y - a.y) / (b.x - a.x));
    }
  }
  const slope = median(slopes);
  if (slope === null) return null;
  // At least two points exist once a slope was found.
  const intercept = median(points.map((p) => p.y - slope * p.x)) as number;
  return { slope, intercept };
}
