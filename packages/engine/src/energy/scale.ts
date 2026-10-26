import { theilSen } from '../stats';

import { energyConfig as C } from './config';
import { dayBalance, isLogged, type EnergyDay } from './balance';
import { daysBetween } from './energy';
import type { TrendPoint } from './trend';

export interface WeekComparison {
  /** Monday of the week. */
  week: string;
  /** Fat change the energy balance predicts (kg, negative = loss). */
  expectedKg: number;
  /** Change of the trend over the week (kg). */
  actualKg: number;
  weighIns: number;
}

export type Confidence = 'low' | 'medium' | 'high';

export type ScaleComparison =
  | { status: 'notEnoughData' }
  | {
      status: 'ok';
      weeks: WeekComparison[];
      expectedKg: number;
      actualKg: number;
      /** actual − expected: positive means the scale went down less (or up more) than calculated. */
      deviationKg: number;
      confidence: Confidence;
    };

const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/**
 * "Calculation vs. scale": the fat change the logged energy balance predicts against what the
 * trend did, over complete calendar weeks only. A week counts when it is over, all seven days are
 * logged and not marked incomplete (holidays, gaps and half-logged days drop the whole week), and
 * it has at least three weigh-ins; its trend change is the robust slope of those points × 7.
 * Confidence grows with the number of weeks and drops one step when weigh-ins are sparse.
 */
export function calculationVsScale(input: {
  days: readonly EnergyDay[];
  trend: readonly TrendPoint[];
  today: string;
}): ScaleComparison {
  const byWeek = new Map<string, EnergyDay[]>();
  for (const d of input.days) {
    const w = mondayOf(d.day);
    byWeek.set(w, [...(byWeek.get(w) ?? []), d]);
  }
  const weeks: WeekComparison[] = [];
  for (const [week, days] of [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (daysBetween(week, input.today) < 7) continue;
    const logged = days.filter(isLogged);
    if (new Set(logged.map((d) => d.day)).size < 7) continue;
    const points = input.trend.filter((p) => {
      const off = daysBetween(week, p.date);
      return off >= 0 && off < 7;
    });
    if (points.length < C.scale.minWeighInsPerWeek) continue;
    // Three or more distinct days always give a slope.
    const fit = theilSen(points.map((p) => ({ x: daysBetween(week, p.date), y: p.trendKg }))) as {
      slope: number;
    };
    const balance = logged.reduce((s, d) => s + (dayBalance(d) as number), 0);
    weeks.push({
      week,
      expectedKg: balance / C.kcalPerKgFat,
      actualKg: fit.slope * 7,
      weighIns: points.length,
    });
  }
  if (weeks.length === 0) return { status: 'notEnoughData' };
  const expectedKg = weeks.reduce((s, w) => s + w.expectedKg, 0);
  const actualKg = weeks.reduce((s, w) => s + w.actualKg, 0);
  const levels: Confidence[] = ['low', 'medium', 'high'];
  let level = weeks.length >= C.scale.highWeeks ? 2 : weeks.length >= C.scale.mediumWeeks ? 1 : 0;
  const avgWeighIns = weeks.reduce((s, w) => s + w.weighIns, 0) / weeks.length;
  if (avgWeighIns < 5) level = Math.max(0, level - 1);
  return {
    status: 'ok',
    weeks,
    expectedKg,
    actualKg,
    deviationKg: actualKg - expectedKg,
    confidence: levels[level] as Confidence,
  };
}
