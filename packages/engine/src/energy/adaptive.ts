import { energyConfig as C } from './config';
import { isLogged, type EnergyDay } from './balance';
import { daysBetween } from './energy';
import { trendOn, type TrendPoint } from './trend';

/** One adaptive estimate, stored with everything it was computed from. */
export interface TdeeEstimate {
  date: string;
  /** Estimated real maintenance (kcal/day), after the bounds. */
  tdeeKcal: number;
  /** Before the bounds. */
  rawKcal: number;
  /** Average formula estimate (resting + active) over the same days. */
  formulaKcal: number;
  /** tdee − formula: what the formula is off by for this person; added to daily targets. */
  correctionKcal: number;
  /** A bound limited the change. */
  clamped: boolean;
  basis: {
    from: string;
    to: string;
    /** Complete days with logged intake that were used. */
    intakeDays: number;
    /** Days in the window left out (incomplete or not logged). */
    excludedDays: number;
    avgIntakeKcal: number;
    trendStartKg: number;
    trendEndKg: number;
    spanDays: number;
  };
}

export type AdaptiveResult =
  | { status: 'ok'; estimate: TdeeEstimate }
  | { status: 'notEnoughData'; usedDays: number; neededDays: number };

/**
 * Adaptive TDEE: real maintenance from what was eaten and what the trend did. With ≥ 14 complete
 * logged days (in the last 28) and a trend at both ends: TDEE = mean intake − Δtrend × 7,700 /
 * days. It never jumps: at most 100 kcal per week away from the previous estimate, and never more
 * than 30 % from the formula (a logging error, not a metabolism).
 */
export function adaptiveTdee(input: {
  days: readonly EnergyDay[];
  trend: readonly TrendPoint[];
  today: string;
  previous?: Pick<TdeeEstimate, 'date' | 'tdeeKcal'> | null;
}): AdaptiveResult {
  const cfg = C.adaptive;
  const window = input.days.filter(
    (d) => d.day < input.today && daysBetween(d.day, input.today) <= cfg.windowDays,
  );
  const used = window
    .filter(isLogged)
    .filter((d) => trendOn(input.trend, d.day, 3) !== null)
    .sort((a, b) => a.day.localeCompare(b.day));
  const first = used[0];
  const last = used.at(-1);
  if (used.length < cfg.minDays || !first || !last) {
    return { status: 'notEnoughData', usedDays: used.length, neededDays: cfg.minDays };
  }
  const start = trendOn(input.trend, first.day, 3) as TrendPoint;
  const end = trendOn(input.trend, last.day, 3) as TrendPoint;
  const spanDays = Math.max(1, daysBetween(first.day, last.day));
  const avgIntake = used.reduce((s, d) => s + (d.intakeKcal as number), 0) / used.length;
  const formula = used.reduce((s, d) => s + d.restingKcal + d.activeKcal, 0) / used.length;
  const raw = avgIntake - ((end.trendKg - start.trendKg) * C.kcalPerKgFat) / spanDays;

  let bounded = Math.min(
    formula * (1 + cfg.maxShareFromFormula),
    Math.max(formula * (1 - cfg.maxShareFromFormula), raw),
  );
  if (input.previous) {
    const weeks = Math.max(1, daysBetween(input.previous.date, input.today) / 7);
    const step = cfg.maxChangePerWeekKcal * weeks;
    bounded = Math.min(
      input.previous.tdeeKcal + step,
      Math.max(input.previous.tdeeKcal - step, bounded),
    );
  }
  const tdeeKcal = Math.round(bounded);
  const formulaKcal = Math.round(formula);
  return {
    status: 'ok',
    estimate: {
      date: input.today,
      tdeeKcal,
      rawKcal: Math.round(raw),
      formulaKcal,
      correctionKcal: tdeeKcal - formulaKcal,
      clamped: Math.round(raw) !== tdeeKcal,
      basis: {
        from: first.day,
        to: last.day,
        intakeDays: used.length,
        excludedDays: window.length - used.length,
        avgIntakeKcal: Math.round(avgIntake),
        trendStartKg: start.trendKg,
        trendEndKg: end.trendKg,
        spanDays,
      },
    },
  };
}
