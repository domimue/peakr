import { computeBaseline, deviationFrom, type Deviation } from './baseline';
import { healthConfig } from './config';
import type { HealthMetric, SeriesPoint } from './types';

/**
 * Recovery signal from resting HR, overnight HRV and sleep duration, each against the user's own
 * 30-day baseline. It only ever **suggests** – the plan is never changed from here (CLAUDE.md
 * "Health → Nothing changes automatically").
 */

export type RecoveryMetric = keyof typeof healthConfig.recovery;
export const RECOVERY_METRICS = Object.keys(healthConfig.recovery) as RecoveryMetric[];

export type RecoveryLevel = 'normal' | 'slightly_off' | 'clearly_off';

export interface RecoveryReason {
  metric: RecoveryMetric;
  level: 'slightly_off' | 'clearly_off';
  direction: 'above' | 'below';
  /** Absolute difference to the baseline median, in the metric's unit (bpm, ms, min). */
  amount: number;
}

export type RecoverySignal =
  | {
      status: 'ok';
      level: RecoveryLevel;
      /** Off-baseline readings in the direction that matters, worst first. */
      reasons: RecoveryReason[];
      /** Metrics that had a value and a baseline today. */
      used: RecoveryMetric[];
      /** Metrics without today's value or without enough history. */
      missing: RecoveryMetric[];
      /** Offer "make today easier" (the user confirms; nothing happens on its own). */
      suggestEasier: boolean;
    }
  | { status: 'insufficient'; missing: RecoveryMetric[] };

export function recoverySignal(
  seriesByMetric: Partial<Record<HealthMetric, readonly SeriesPoint[]>>,
  day: string,
): RecoverySignal {
  const reasons: (RecoveryReason & { z: number })[] = [];
  const used: RecoveryMetric[] = [];
  const missing: RecoveryMetric[] = [];

  for (const metric of RECOVERY_METRICS) {
    const series = seriesByMetric[metric] ?? [];
    const today = series.find((p) => p.day === day);
    const baseline = computeBaseline(metric, series, day, 30);
    if (!today || baseline.status !== 'ok') {
      missing.push(metric);
      continue;
    }
    used.push(metric);
    const dev: Deviation = deviationFrom(today.value, baseline);
    if (dev.level !== 'within' && dev.direction === healthConfig.recovery[metric]) {
      reasons.push({
        metric,
        level: dev.level,
        direction: dev.direction,
        amount: Math.abs(dev.delta),
        z: Math.abs(dev.z),
      });
    }
  }

  if (used.length === 0) return { status: 'insufficient', missing };

  const clearly = reasons.some((r) => r.level === 'clearly_off');
  const level: RecoveryLevel =
    clearly || reasons.length >= 2
      ? 'clearly_off'
      : reasons.length === 1
        ? 'slightly_off'
        : 'normal';
  return {
    status: 'ok',
    level,
    reasons: reasons
      .sort((a, b) => b.z - a.z)
      .map((r) => ({ metric: r.metric, level: r.level, direction: r.direction, amount: r.amount })),
    used,
    missing,
    suggestEasier: level === 'clearly_off',
  };
}
