import { energyConfig as C } from './config';
import { daysBetween } from './energy';

export interface WeighIn {
  date: string;
  weightKg: number;
}

export interface TrendPoint {
  date: string;
  /** The day's weigh-in (mean of several). */
  weightKg: number;
  trendKg: number;
  /** Far from the trend (water, a late meal, a scale error): shown, barely counted. */
  outlier: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Smoothed weight trend: exponentially weighted moving average (alpha ≈ 0.1 per day). Robust in
 * two ways: a weigh-in can pull the trend by at most 2 % of the trend weight (one heavy morning
 * after a salty dinner barely moves it), and days without a weigh-in count as days, so a gap is
 * caught up in proportion instead of jumping. Calculations always use this, never a weigh-in.
 */
export function weightTrend(
  weighIns: readonly WeighIn[],
  alpha: number = C.trend.alpha,
): TrendPoint[] {
  const byDay = new Map<string, number[]>();
  for (const w of weighIns) {
    if (!Number.isFinite(w.weightKg) || w.weightKg <= 0) continue;
    byDay.set(w.date, [...(byDay.get(w.date) ?? []), w.weightKg]);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const points: TrendPoint[] = [];
  let trend: number | null = null;
  let last: string | null = null;
  for (const [date, values] of days) {
    const weight = values.reduce((a, b) => a + b, 0) / values.length;
    let outlier = false;
    if (trend === null || last === null) {
      trend = weight;
    } else {
      const residual = weight - trend;
      outlier = Math.abs(residual) > trend * C.trend.outlierShare;
      const cap = trend * C.trend.maxResidualShare;
      const limited = Math.max(-cap, Math.min(cap, residual));
      const step = 1 - (1 - alpha) ** Math.max(1, daysBetween(last, date));
      trend += step * limited;
    }
    last = date;
    points.push({ date, weightKg: round1(weight), trendKg: round1(trend), outlier });
  }
  return points;
}

/** The latest trend weight, or null without weigh-ins. */
export function trendWeightKg(weighIns: readonly WeighIn[]): number | null {
  return weightTrend(weighIns).at(-1)?.trendKg ?? null;
}

/** The trend on a day: the last point on or before it (within `maxAgeDays`), else null. */
export function trendOn(
  points: readonly TrendPoint[],
  date: string,
  maxAgeDays = 7,
): TrendPoint | null {
  let found: TrendPoint | null = null;
  for (const p of points) {
    if (p.date > date) break;
    found = p;
  }
  return found && daysBetween(found.date, date) <= maxAgeDays ? found : null;
}
