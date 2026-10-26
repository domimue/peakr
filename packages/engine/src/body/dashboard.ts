import type { BodySex } from '../energy/energy';
import { daysBetween } from '../energy/energy';
import { dayBalance, isLogged, type EnergyDay } from '../energy/balance';
import { energyConfig as C } from '../energy/config';
import type { ScaleComparison } from '../energy/scale';
import { trendOn, type TrendPoint } from '../energy/trend';
import { MEASUREMENTS, type MeasurementKey } from './body';

/**
 * Body dashboard figures (CLAUDE.md "Energy & body rules": all of it here, never in the UI):
 * goal progress, body indices, weekly energy bars, forecast lines for the trend chart, reasons
 * for a gap between calculation and scale, measurement trends and the training week from Teil A.
 */

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/** Share of the way from the start weight to the target (0–100); null without a distance. */
export function goalProgress(input: {
  startKg: number;
  targetKg: number;
  currentKg: number;
}): number | null {
  const total = input.targetKg - input.startKg;
  if (Math.abs(total) < 0.05) return null;
  const done = (input.currentKg - input.startKg) / total;
  return Math.round(Math.min(1, Math.max(0, done)) * 100);
}

/** Common reference values, shown next to the numbers – never as a diagnosis. */
export const BODY_INDEX_REFERENCES = {
  bmi: { low: 18.5, high: 25 },
  waistToHeight: 0.5,
  waistToHip: { male: 0.9, female: 0.85 },
} as const;

export interface BodyIndices {
  bmi: number | null;
  waistToHeight: number | null;
  waistToHip: number | null;
  /** Above the common reference (BMI: outside the range). Information, not a judgement. */
  aboveReference: { bmi: boolean; waistToHeight: boolean; waistToHip: boolean };
}

export function bodyIndices(input: {
  sex: BodySex;
  heightCm: number;
  weightKg: number | null;
  waistCm: number | null;
  hipCm: number | null;
}): BodyIndices {
  const R = BODY_INDEX_REFERENCES;
  const m = input.heightCm / 100;
  const bmi = input.weightKg !== null && m > 0 ? r1(input.weightKg / (m * m)) : null;
  const whtr =
    input.waistCm !== null && input.heightCm > 0 ? r2(input.waistCm / input.heightCm) : null;
  const whr = input.waistCm !== null && input.hipCm ? r2(input.waistCm / input.hipCm) : null;
  return {
    bmi,
    waistToHeight: whtr,
    waistToHip: whr,
    aboveReference: {
      bmi: bmi !== null && (bmi < R.bmi.low || bmi >= R.bmi.high),
      waistToHeight: whtr !== null && whtr >= R.waistToHeight,
      waistToHip: whr !== null && whr >= R.waistToHip[input.sex],
    },
  };
}

export interface WeekEnergyBar {
  /** Monday of the week. */
  week: string;
  /** Complete, logged days the averages come from. */
  loggedDays: number;
  /** Averages per day (over the logged days; resting/active over all days without a log). */
  restingKcal: number;
  activeKcal: number;
  intakeKcal: number | null;
  /** Sum over the logged days (negative = deficit). */
  balanceKcal: number | null;
  /** Estimated fat change from the balance (kg; an estimate). */
  fatKg: number | null;
}

/** The last `weeks` calendar weeks up to today's, oldest first, for the stacked bars. */
export function weeklyEnergyBars(
  days: readonly EnergyDay[],
  today: string,
  weeks = 8,
): WeekEnergyBar[] {
  const first = addDays(mondayOf(today), -7 * (weeks - 1));
  const out: WeekEnergyBar[] = [];
  for (let w = 0; w < weeks; w++) {
    const week = addDays(first, 7 * w);
    const inWeek = days.filter((d) => {
      const off = daysBetween(week, d.day);
      return off >= 0 && off < 7;
    });
    const logged = inWeek.filter(isLogged);
    const pool = logged.length ? logged : inWeek;
    const avg = (f: (d: EnergyDay) => number) =>
      pool.length ? Math.round(pool.reduce((s, d) => s + f(d), 0) / pool.length) : 0;
    const balance = logged.reduce((s, d) => s + (dayBalance(d) as number), 0);
    out.push({
      week,
      loggedDays: logged.length,
      restingKcal: avg((d) => d.restingKcal),
      activeKcal: avg((d) => d.activeKcal),
      intakeKcal: logged.length ? avg((d) => d.intakeKcal as number) : null,
      balanceKcal: logged.length ? balance : null,
      fatKg: logged.length ? r2(balance / C.kcalPerKgFat) : null,
    });
  }
  return out;
}

export interface ForecastPoint {
  date: string;
  kg: number;
}

/**
 * Lines for the trend chart from today's trend weight towards the target: at the chosen rate and
 * at the real pace of the trend (when there is one). Weekly points, at most `maxWeeks`.
 */
export function forecastLines(input: {
  kind: 'lose' | 'gain' | 'maintain';
  fromKg: number;
  today: string;
  targetKg: number | null;
  plannedRatePerWeekKg: number;
  realPaceKgPerWeek: number | null;
  maxWeeks?: number;
}): { planned: ForecastPoint[]; real: ForecastPoint[] } {
  const target = input.targetKg;
  if (input.kind === 'maintain' || target === null) return { planned: [], real: [] };
  const dir = input.kind === 'lose' ? -1 : 1;
  const line = (rate: number | null): ForecastPoint[] => {
    if (!rate || rate <= 0) return [];
    const weeks = Math.min(input.maxWeeks ?? 52, Math.ceil(Math.abs(target - input.fromKg) / rate));
    const points: ForecastPoint[] = [{ date: input.today, kg: r1(input.fromKg) }];
    for (let w = 1; w <= weeks; w++) {
      const kg = input.fromKg + dir * rate * w;
      const reached = dir < 0 ? kg <= target : kg >= target;
      points.push({ date: addDays(input.today, 7 * w), kg: r1(reached ? target : kg) });
      if (reached) break;
    }
    return points;
  };
  return { planned: line(input.plannedRatePerWeekKg), real: line(input.realPaceKgPerWeek) };
}

export type ScaleReason =
  | 'matches'
  | 'underLogged'
  | 'overLogged'
  | 'activeOverestimated'
  | 'activeUnderestimated'
  | 'water'
  | 'fewWeeks';

/** Below this the calculation and the scale agree (kg over the compared weeks). */
const SCALE_MATCH_KG = 0.3;

/**
 * Plain reasons for a gap between "calculation" and "scale", most likely first. A scale that
 * went down less than calculated points to missed entries or a too generous activity estimate; a
 * scale that went down more usually means water and glycogen, or entries counted too high.
 */
export function scaleReasons(scale: ScaleComparison): ScaleReason[] {
  if (scale.status !== 'ok') return [];
  const out: ScaleReason[] =
    Math.abs(scale.deviationKg) < SCALE_MATCH_KG
      ? ['matches']
      : scale.deviationKg > 0
        ? ['underLogged', 'activeOverestimated', 'water']
        : ['water', 'activeUnderestimated', 'overLogged'];
  if (scale.confidence === 'low') out.push('fewWeeks');
  return out;
}

export interface MeasurementTrend {
  key: MeasurementKey;
  startDay: string;
  startCm: number;
  currentDay: string;
  currentCm: number;
  /** Null with a single measurement. */
  changeCm: number | null;
}

/** First and latest value of every measurement, in the order of `MEASUREMENTS`. */
export function measurementTrends(
  checkIns: readonly { day: string; values: Partial<Record<string, number>> }[],
): MeasurementTrend[] {
  const sorted = [...checkIns].sort((a, b) => a.day.localeCompare(b.day));
  const out: MeasurementTrend[] = [];
  for (const { key } of MEASUREMENTS) {
    const points = sorted.flatMap((c) => {
      const v = c.values[key];
      return typeof v === 'number' ? [{ day: c.day, cm: v }] : [];
    });
    const start = points[0];
    const current = points.at(-1);
    if (!start || !current) continue;
    out.push({
      key,
      startDay: start.day,
      startCm: start.cm,
      currentDay: current.day,
      currentCm: current.cm,
      changeCm: points.length > 1 ? r1(current.cm - start.cm) : null,
    });
  }
  return out;
}

export type TrainingGroup = 'run' | 'bike' | 'swim' | 'strength' | 'other';

export interface TrainingWeek {
  groups: Record<TrainingGroup, { done: number; planned: number }>;
  done: number;
  planned: number;
  minutesDone: number;
}

const GROUPS: readonly TrainingGroup[] = ['run', 'bike', 'swim', 'strength'];

/** This week's sessions from the plan (Teil A) by sport: done and planned. Skipped ones drop out. */
export function trainingWeek(
  workouts: readonly {
    sport: string;
    status: 'planned' | 'done' | 'skipped';
    durationMin: number;
  }[],
): TrainingWeek {
  const groups = Object.fromEntries(
    [...GROUPS, 'other'].map((g) => [g, { done: 0, planned: 0 }]),
  ) as TrainingWeek['groups'];
  let minutesDone = 0;
  for (const w of workouts) {
    if (w.status === 'skipped') continue;
    const g =
      groups[
        (GROUPS as readonly string[]).includes(w.sport) ? (w.sport as TrainingGroup) : 'other'
      ];
    g.planned++;
    if (w.status === 'done') {
      g.done++;
      minutesDone += w.durationMin;
    }
  }
  const all = Object.values(groups);
  return {
    groups,
    done: all.reduce((s, g) => s + g.done, 0),
    planned: all.reduce((s, g) => s + g.planned, 0),
    minutesDone: Math.round(minutesDone),
  };
}

/** The trend change over a period (kg); null without trend values at both ends. */
export function trendChange(
  trend: readonly TrendPoint[],
  from: string,
  to: string,
  maxAgeDays = 7,
): number | null {
  const a = trendOn(trend, from, maxAgeDays);
  const b = trendOn(trend, to, maxAgeDays);
  return a && b && a.date !== b.date ? r1(b.trendKg - a.trendKg) : null;
}
