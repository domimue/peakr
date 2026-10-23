import { parseIsoDate, toIsoDate } from '../plan/dates';
import { mad, median, theilSen } from '../stats';
import { healthConfig } from './config';
import type { HealthMetric, SeriesPoint } from './types';

/**
 * Personal baseline per metric: rolling median and a normal band over the last 30 or 90 days
 * **before** the day in question. Median and MAD keep single outliers (a night out, a sick day,
 * a missing strap) from moving the band; missing days are simply absent.
 */

export type BaselineWindow = (typeof healthConfig.baseline.windows)[number];

export type Baseline =
  | {
      status: 'ok';
      window: BaselineWindow;
      median: number;
      /** Robust spread (MAD × 1.4826, at least the metric's minimum scale). */
      scale: number;
      low: number;
      high: number;
      /** Values the band is built from. */
      n: number;
    }
  | { status: 'insufficient'; window: BaselineWindow; n: number; needed: number };

function dayNumber(iso: string): number {
  const d = parseIsoDate(iso);
  if (d === null) throw new Error(`Invalid date ${iso}`);
  return d;
}

/** Values of the `window` days before `day` (exclusive), one per day (later duplicates win). */
export function windowValues(
  series: readonly SeriesPoint[],
  day: string,
  window: number,
): number[] {
  const end = dayNumber(day);
  const start = end - window;
  const byDay = new Map<number, number>();
  for (const p of series) {
    const d = parseIsoDate(p.day);
    if (d === null || d < start || d >= end || !Number.isFinite(p.value)) continue;
    byDay.set(d, p.value);
  }
  return [...byDay.values()];
}

export function computeBaseline(
  metric: HealthMetric,
  series: readonly SeriesPoint[],
  day: string,
  window: BaselineWindow = 30,
): Baseline {
  const cfg = healthConfig.baseline;
  const values = windowValues(series, day, window);
  const needed = cfg.minValues[window];
  if (values.length < needed) return { status: 'insufficient', window, n: values.length, needed };
  const m = median(values) as number;
  const scale = Math.max((mad(values) as number) * cfg.madScale, healthConfig.minScale[metric]);
  return {
    status: 'ok',
    window,
    median: m,
    scale,
    low: m - cfg.bandZ * scale,
    high: m + cfg.bandZ * scale,
    n: values.length,
  };
}

export type DeviationLevel = 'within' | 'slightly_off' | 'clearly_off';

export interface Deviation {
  level: DeviationLevel;
  direction: 'above' | 'below' | null;
  /** value − baseline median, in the metric's unit. */
  delta: number;
  /** Distance from the median in robust scales. */
  z: number;
}

/** How far a value is from the user's own baseline. */
export function deviationFrom(value: number, baseline: Baseline & { status: 'ok' }): Deviation {
  const delta = value - baseline.median;
  const z = delta / baseline.scale;
  const abs = Math.abs(z);
  const level: DeviationLevel =
    abs > healthConfig.baseline.clearlyZ
      ? 'clearly_off'
      : abs > healthConfig.baseline.bandZ
        ? 'slightly_off'
        : 'within';
  return { level, direction: level === 'within' ? null : delta > 0 ? 'above' : 'below', delta, z };
}

export type TrendDirection = 'up' | 'down' | 'flat';

export type Trend =
  | {
      status: 'ok';
      direction: TrendDirection;
      /** Median of the last 7 days (incl. `day`) and of the 30 days before. */
      recentMedian: number;
      baselineMedian: number;
      /** Theil–Sen slope over the last 30 days, per week. */
      slopePerWeek: number;
    }
  | { status: 'insufficient' };

/** Recent 7 days against the 30-day baseline before them. */
export function computeTrend(
  metric: HealthMetric,
  series: readonly SeriesPoint[],
  day: string,
): Trend {
  const cfg = healthConfig.trend;
  const next = toIsoDate(dayNumber(day) + 1);
  const recent = windowValues(series, next, cfg.recentDays);
  const recentStart = toIsoDate(dayNumber(next) - cfg.recentDays);
  const baseline = computeBaseline(metric, series, recentStart, 30);
  if (recent.length < cfg.minRecentValues || baseline.status !== 'ok') {
    return { status: 'insufficient' };
  }
  const recentMedian = median(recent) as number;
  const diff = recentMedian - baseline.median;
  const direction: TrendDirection =
    Math.abs(diff) <= cfg.thresholdZ * baseline.scale ? 'flat' : diff > 0 ? 'up' : 'down';

  const end = dayNumber(next);
  const points = series
    .map((p) => ({ x: parseIsoDate(p.day), y: p.value }))
    .filter((p): p is { x: number; y: number } => p.x !== null && p.x >= end - 30 && p.x < end);
  // The baseline needs ≥ 14 values that partly fall into these 30 days, plus ≥ 4 recent ones, so
  // there are always several distinct days and the fit exists.
  const fit = theilSen(points) as { slope: number };
  return {
    status: 'ok',
    direction,
    recentMedian,
    baselineMedian: baseline.median,
    slopePerWeek: fit.slope * 7,
  };
}

export interface BandPoint {
  day: string;
  low: number;
  median: number;
  high: number;
}

/**
 * The baseline band for every day from `from` to `to` (inclusive), each built from the days before
 * it – for the band behind the 7-day, 30-day and 12-month charts. Days without enough history are
 * left out, so the chart shows a gap instead of a made-up band.
 */
export function baselineBand(
  metric: HealthMetric,
  series: readonly SeriesPoint[],
  from: string,
  to: string,
  window: BaselineWindow = 30,
): BandPoint[] {
  const out: BandPoint[] = [];
  for (let d = dayNumber(from); d <= dayNumber(to); d++) {
    const day = toIsoDate(d);
    const b = computeBaseline(metric, series, day, window);
    if (b.status === 'ok') out.push({ day, low: b.low, median: b.median, high: b.high });
  }
  return out;
}
