import { theilSen } from '../stats';

import type { AdaptiveResult } from './adaptive';
import { dayBalance, isLogged, type EnergyDay } from './balance';
import { energyConfig as C } from './config';
import { daysBetween, intakeFloorKcal, type BodySex } from './energy';
import { maxLossRatePerWeekKg, type TargetReason, type WeightGoalKind } from './safety';
import type { ModelDay } from './days';
import { trendOn, type TrendPoint } from './trend';

/**
 * Weight goal module (CLAUDE.md "Weight goal rules"): presets, daily and weekly targets, protein,
 * forecast, weekly check-in, plateau, target reached and training interaction. The safety rules
 * (max rate, floor, BMI, age, rapid loss) cannot be relaxed by any input.
 */

const G = C.goal;
const KCAL_PER_KG_PER_DAY = C.kcalPerKgFat / 7;
const round2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The highest weekly rate a goal kind allows at this weight. */
export function maxRateFor(kind: WeightGoalKind, weightKg: number): number {
  if (kind === 'lose') return maxLossRatePerWeekKg(weightKg);
  if (kind === 'gain') return G.maxGainKgPerWeek;
  return 0;
}

/** A custom rate in 0.05 kg steps, at least one step. */
export function customRate(value: number): number {
  const steps = Math.round(value / G.rateStep);
  return round2(Math.max(1, steps) * G.rateStep);
}

export interface GoalTargetsInput {
  kind: WeightGoalKind;
  ratePerWeekKg: number;
  /** Maintenance: the adaptive TDEE once there is one, else the formula estimate. */
  tdeeKcal: number;
  /** Maintenance without workouts (resting + everyday movement + adaptive correction). */
  nonExerciseTdeeKcal: number;
  bmrKcal: number;
  sex: BodySex;
  weightKg: number;
  reason?: TargetReason;
}

export interface GoalTargets {
  /** The rate actually used (after the max-rate limit). */
  ratePerWeekKg: number;
  /** Planned deficit per day (negative = surplus), after the floor. */
  deficitKcal: number;
  /** TDEE − deficit: the target on an average day. */
  dailyKcal: number;
  /** Non-exercise TDEE − deficit: the target before workouts are eaten back. */
  baseKcal: number;
  floorKcal: number;
  /** The floor raised the target: a warning is shown, never a lower number. */
  floorApplied: boolean;
  /** The rate the targets really allow. */
  effectiveRatePerWeekKg: number;
  reason: TargetReason;
  protein: { gPerKg: number; grams: number };
}

/** Daily target = TDEE − rate × 7,700 / 7 (surplus for gaining), never below the floor. */
export function goalTargets(input: GoalTargetsInput): GoalTargets {
  const max = maxRateFor(input.kind, input.weightKg);
  const rate = Math.min(Math.max(0, input.ratePerWeekKg), max);
  const sign = input.kind === 'gain' ? 1 : -1;
  const perDay = Math.round(rate * KCAL_PER_KG_PER_DAY);
  const floorKcal = intakeFloorKcal(input.sex, input.bmrKcal);
  const baseWanted = Math.round(input.nonExerciseTdeeKcal) + sign * perDay;
  const baseKcal = Math.max(baseWanted, floorKcal);
  const floorApplied = baseWanted < floorKcal;
  const deficitKcal = Math.round(input.nonExerciseTdeeKcal) - baseKcal;
  const dailyKcal = Math.max(Math.round(input.tdeeKcal) - deficitKcal, floorKcal);
  const clamped = (input.kind !== 'maintain' && rate < input.ratePerWeekKg) || floorApplied;
  return {
    ratePerWeekKg: round2(rate),
    deficitKcal,
    dailyKcal,
    baseKcal,
    floorKcal,
    floorApplied,
    effectiveRatePerWeekKg: round2(Math.abs(deficitKcal) / KCAL_PER_KG_PER_DAY),
    reason: clamped ? 'safety_clamp' : (input.reason ?? 'user'),
    protein: proteinForGoal({
      weightKg: input.weightKg,
      deficitKcal,
      tdeeKcal: input.tdeeKcal,
      kind: input.kind,
    }),
  };
}

export type PresetKey = keyof typeof G.presets.lose | keyof typeof G.presets.gain;

export interface RatePreset {
  key: PresetKey;
  rate: number;
  enabled: boolean;
  /** Why it cannot be chosen (shown next to it). */
  disabledReason?: 'aboveMaxRate';
  maxRate: number;
  /** With the floor, this is the rate the preset really reaches. */
  effectiveRate: number;
  floorApplied: boolean;
}

/** The presets for a goal kind: those above the max rate disabled, each with its real rate. */
export function ratePresets(input: {
  kind: 'lose' | 'gain';
  weightKg: number;
  tdeeKcal: number;
  bmrKcal: number;
  sex: BodySex;
}): RatePreset[] {
  const maxRate = maxRateFor(input.kind, input.weightKg);
  return Object.entries(G.presets[input.kind]).map(([key, rate]) => {
    const enabled = rate <= maxRate + 1e-9;
    const t = goalTargets({
      ...input,
      ratePerWeekKg: rate,
      nonExerciseTdeeKcal: input.tdeeKcal,
    });
    return {
      key: key as PresetKey,
      rate,
      enabled,
      ...(enabled ? {} : { disabledReason: 'aboveMaxRate' as const }),
      maxRate,
      effectiveRate: enabled ? t.effectiveRatePerWeekKg : maxRate,
      floorApplied: enabled && t.floorApplied,
    };
  });
}

/** A day's target: the base plus the chosen share of the day's workout energy (default 50 %). */
export function dayTarget(input: {
  baseKcal: number;
  workoutKcal: number;
  eatBackPct?: number;
}): number {
  const pct = Math.min(100, Math.max(0, input.eatBackPct ?? G.eatBackPct));
  return Math.round(input.baseKcal + (Math.max(0, input.workoutKcal) * pct) / 100);
}

/**
 * Weekly mode: the same weekly total as eating back day by day, spread by each day's energy need
 * (non-exercise TDEE + planned workout energy) – more on training days, less on rest days, no day
 * below the floor. The days add up exactly to the total.
 */
export function weeklyPlan(input: {
  baseKcal: number;
  nonExerciseKcal: number;
  /** Planned workout energy per day of the week (7 values). */
  plannedWorkoutKcal: readonly number[];
  eatBackPct?: number;
  floorKcal: number;
}): { totalKcal: number; days: number[] } {
  const totalKcal = input.plannedWorkoutKcal.reduce(
    (s, w) =>
      s + dayTarget({ baseKcal: input.baseKcal, workoutKcal: w, eatBackPct: input.eatBackPct }),
    0,
  );
  const need = input.plannedWorkoutKcal.map((w) => input.nonExerciseKcal + Math.max(0, w));
  const floored = new Set<number>();
  let raw: number[] = [];
  // Days that would fall under the floor get the floor; the rest share what is left.
  for (;;) {
    const left = totalKcal - floored.size * input.floorKcal;
    const weight = need.reduce((s, n, i) => s + (floored.has(i) ? 0 : n), 0);
    raw = need.map((n, i) => (floored.has(i) ? input.floorKcal : (left * n) / weight));
    const below = raw.findIndex((v, i) => !floored.has(i) && v < input.floorKcal);
    if (below < 0) break;
    floored.add(below);
  }
  const days = raw.map((v) => Math.round(v));
  const diff = totalKcal - days.reduce((a, b) => a + b, 0);
  const biggest = days.indexOf(Math.max(...days));
  days[biggest] = (days[biggest] as number) + diff;
  return { totalKcal, days };
}

/** Protein: 1.6 g/kg, rising to 2.2 g/kg as the deficit grows (to 25 % of TDEE). */
export function proteinForGoal(input: {
  weightKg: number;
  deficitKcal: number;
  tdeeKcal: number;
  kind: WeightGoalKind;
}): { gPerKg: number; grams: number } {
  const { min, max } = G.proteinGPerKg;
  let gPerKg = G.proteinBaseGPerKg;
  if (input.kind === 'lose' && input.deficitKcal > 0) {
    const share = Math.min(1, input.deficitKcal / (input.tdeeKcal * G.proteinFullDeficitShare));
    gPerKg = Math.round((min + (max - min) * share) * 10) / 10;
  }
  return { gPerKg, grams: Math.round(gPerKg * input.weightKg) };
}

/** Trend change per week over the last `maxDays` (robust slope), or null below `minDays`. */
function trendRate(
  trend: readonly TrendPoint[],
  today: string,
  minDays: number,
  maxDays: number,
): number | null {
  const recent = trend.filter((p) => p.date <= today && daysBetween(p.date, today) <= maxDays);
  const first = recent[0];
  const last = recent.at(-1);
  if (!first || !last || daysBetween(first.date, last.date) < minDays) return null;
  const fit = theilSen(
    recent.map((p) => ({ x: daysBetween(first.date, p.date), y: p.trendKg })),
  ) as {
    slope: number;
  };
  return fit.slope * 7;
}

export interface GoalForecast {
  /** At the chosen rate. */
  plannedDate: string | null;
  /** Trend pace of the last 2–4 weeks in the goal's direction (kg/week), when there is one. */
  realPaceKgPerWeek: number | null;
  realDate: string | null;
}

/** Goal date from the chosen rate, and the date at the real pace of the trend – both shown. */
export function goalForecast(input: {
  kind: WeightGoalKind;
  startKg: number;
  targetKg: number;
  ratePerWeekKg: number;
  trend: readonly TrendPoint[];
  today: string;
}): GoalForecast {
  const remaining = Math.abs(input.targetKg - input.startKg);
  const date = (rate: number) => addDays(input.today, Math.ceil((remaining / rate) * 7));
  if (input.kind === 'maintain' || remaining === 0) {
    return { plannedDate: null, realPaceKgPerWeek: null, realDate: null };
  }
  const slope = trendRate(input.trend, input.today, G.forecast.minDays, G.forecast.maxDays);
  const pace = slope === null ? null : input.kind === 'lose' ? -slope : slope;
  const real = pace !== null && pace > 0.01 ? round2(pace) : null;
  return {
    plannedDate: input.ratePerWeekKg > 0 ? date(input.ratePerWeekKg) : null,
    realPaceKgPerWeek: real,
    realDate: real ? date(real) : null,
  };
}

export type CheckInStatus = 'onTrack' | 'tooFast' | 'tooSlow' | 'notEnoughData';

/**
 * The weekly check-in: actual trend rate of the last two weeks against the planned one, with a
 * suggested change of the daily target (at most ±150 kcal per week). A suggestion only – the user
 * accepts it or not.
 */
export function weeklyCheckIn(input: {
  kind: 'lose' | 'gain';
  plannedRatePerWeekKg: number;
  trend: readonly TrendPoint[];
  today: string;
}): { status: CheckInStatus; actualRatePerWeekKg: number | null; adjustmentKcal: number } {
  const c = G.checkIn;
  const slope = trendRate(input.trend, input.today, c.minDays, c.days);
  if (slope === null)
    return { status: 'notEnoughData', actualRatePerWeekKg: null, adjustmentKcal: 0 };
  const actual = input.kind === 'lose' ? -slope : slope;
  const diff = actual - input.plannedRatePerWeekKg;
  const tolerance = Math.max(c.toleranceKg, c.toleranceShare * input.plannedRatePerWeekKg);
  if (Math.abs(diff) <= tolerance) {
    return { status: 'onTrack', actualRatePerWeekKg: round2(actual), adjustmentKcal: 0 };
  }
  // Losing too fast or gaining too slowly → more food; the other way round → less.
  const more = input.kind === 'lose' ? diff > 0 : diff < 0;
  const kcal = Math.min(c.maxAdjustmentKcal, Math.round(Math.abs(diff) * KCAL_PER_KG_PER_DAY));
  return {
    status: diff > 0 ? 'tooFast' : 'tooSlow',
    actualRatePerWeekKg: round2(actual),
    adjustmentKcal: more ? kcal : -kcal,
  };
}

/**
 * Plateau: no trend change for ≥ 21 days although the logged days show a deficit. Suggests
 * checking logging accuracy or a diet break (maintenance for 1–2 weeks).
 */
export function detectPlateau(input: {
  trend: readonly TrendPoint[];
  days: readonly EnergyDay[];
  today: string;
}): {
  plateau: boolean;
  avgBalanceKcal: number | null;
  suggestions: ('checkLogging' | 'dietBreak')[];
  dietBreakWeeks: readonly number[];
} {
  const p = G.plateau;
  const none = {
    plateau: false,
    avgBalanceKcal: null,
    suggestions: [],
    dietBreakWeeks: p.dietBreakWeeks,
  };
  const start = trendOn(input.trend, addDays(input.today, -p.days), 3);
  const end = trendOn(input.trend, input.today, 3);
  if (!start || !end) return none;
  const logged = input.days.filter(
    (d) => isLogged(d) && d.day < input.today && daysBetween(d.day, input.today) <= p.days,
  );
  if (logged.length < p.minLoggedDays) return none;
  const avg = logged.reduce((s, d) => s + (dayBalance(d) as number), 0) / logged.length;
  const flat = Math.abs(end.trendKg - start.trendKg) < p.maxChangeKg;
  const plateau = flat && avg <= -p.minDeficitKcal;
  return {
    plateau,
    avgBalanceKcal: Math.round(avg),
    suggestions: plateau ? ['checkLogging', 'dietBreak'] : [],
    dietBreakWeeks: p.dietBreakWeeks,
  };
}

/** The trend has reached the target (then: switch to maintain, suggest a reverse diet). */
export function targetReached(input: {
  kind: WeightGoalKind;
  targetKg: number;
  trendKg: number;
}): boolean {
  if (input.kind === 'lose') return input.trendKg <= input.targetKg;
  if (input.kind === 'gain') return input.trendKg >= input.targetKg;
  return false;
}

/** Reverse diet: +100 kcal per week from the current target up to maintenance. */
export function reverseDiet(input: {
  currentKcal: number;
  maintenanceKcal: number;
  today: string;
}): { from: string; intakeKcal: number }[] {
  const steps: { from: string; intakeKcal: number }[] = [];
  let kcal = input.currentKcal;
  while (kcal < input.maintenanceKcal) {
    kcal = Math.min(input.maintenanceKcal, kcal + G.reverseDietStepKcal);
    steps.push({ from: addDays(input.today, steps.length * 7), intakeKcal: Math.round(kcal) });
  }
  return steps;
}

/**
 * Training interaction: in heavy, race and taper weeks a smaller deficit is suggested (half of
 * it); on key workout days a large deficit gets a warning. Suggestions only.
 */
export function trainingInteraction(input: {
  deficitKcal: number;
  weekLoad: number;
  typicalWeekLoad: number;
  raceWeek: boolean;
  taper: boolean;
  /** Dates of key sessions (long, intervals, race) this week. */
  keyDays: readonly string[];
}): {
  suggestedDeficitKcal: number | null;
  reason: 'raceWeek' | 'taper' | 'highLoad' | null;
  keyDayWarnings: string[];
} {
  const t = G.training;
  const reason = input.raceWeek
    ? 'raceWeek'
    : input.taper
      ? 'taper'
      : input.typicalWeekLoad > 0 && input.weekLoad > input.typicalWeekLoad * t.highLoadFactor
        ? 'highLoad'
        : null;
  const reduce = reason !== null && input.deficitKcal > t.smallDeficitKcal;
  return {
    suggestedDeficitKcal: reduce ? Math.round(input.deficitKcal / 2) : null,
    reason: reduce ? reason : null,
    keyDayWarnings: input.deficitKcal > t.keyDayMaxDeficitKcal ? [...input.keyDays] : [],
  };
}

/** This week's planned load against the typical (median) week of the plan. */
export function weekLoadContext(
  weeks: readonly { startDate: string; load: number }[],
  monday: string,
): { weekLoad: number; typicalWeekLoad: number } {
  const loads = weeks.map((w) => w.load).sort((a, b) => a - b);
  const mid = Math.floor(loads.length / 2);
  const typical =
    loads.length === 0
      ? 0
      : loads.length % 2
        ? (loads[mid] as number)
        : ((loads[mid - 1] as number) + (loads[mid] as number)) / 2;
  return {
    weekLoad: weeks.find((w) => w.startDate === monday)?.load ?? 0,
    typicalWeekLoad: typical,
  };
}

/** Maintenance for the goal: the adaptive TDEE once there is one, else the formula estimate. */
export interface EnergyBasis {
  tdeeKcal: number;
  /** Without workouts: resting + everyday movement (+ the adaptive correction). */
  nonExerciseKcal: number;
  bmrKcal: number;
  source: 'adaptive' | 'formula';
}

/** Averages of the last 14 days before today (formula), corrected by the adaptive estimate. */
export function energyBasis(input: {
  days: readonly ModelDayLike[];
  today: string;
  adaptive: AdaptiveResult;
}): EnergyBasis | null {
  const recent = input.days.filter(
    (d) => d.day < input.today && daysBetween(d.day, input.today) <= 14,
  );
  const pool = recent.length > 0 ? recent : input.days.filter((d) => d.day === input.today);
  if (pool.length === 0) return null;
  const avg = (f: (d: ModelDayLike) => number) => pool.reduce((s, d) => s + f(d), 0) / pool.length;
  const bmr = avg((d) => d.restingKcal);
  const nonExercise = avg((d) => d.restingKcal + d.active.neatKcal);
  const formula = avg((d) => d.restingKcal + d.activeKcal);
  if (input.adaptive.status === 'ok') {
    const correction = input.adaptive.estimate.correctionKcal;
    return {
      tdeeKcal: input.adaptive.estimate.tdeeKcal,
      nonExerciseKcal: Math.round(nonExercise + correction),
      bmrKcal: Math.round(bmr),
      source: 'adaptive',
    };
  }
  return {
    tdeeKcal: Math.round(formula),
    nonExerciseKcal: Math.round(nonExercise),
    bmrKcal: Math.round(bmr),
    source: 'formula',
  };
}

type ModelDayLike = Pick<ModelDay, 'day' | 'restingKcal' | 'activeKcal' | 'active'>;

export interface GoalSettings {
  kind: WeightGoalKind;
  targetWeightKg: number | null;
  ratePerWeekKg: number;
  eatBackPct: number;
  weeklyMode: boolean;
  /** Accepted check-in suggestions (kcal/day). */
  adjustmentKcal: number;
}

export interface GoalSnapshot {
  targets: GoalTargets;
  /** Today's target: base + eaten-back workouts (daily mode) or today's share (weekly mode). */
  todayKcal: number;
  /** What today's workouts add on top of the base ("Your ride today: +420 kcal"). */
  addedBackKcal: number;
  weekly: { totalKcal: number; days: number[] } | null;
  forecast: GoalForecast;
  checkIn: ReturnType<typeof weeklyCheckIn> | null;
  plateau: ReturnType<typeof detectPlateau>;
  reached: boolean;
  reverseDiet: { from: string; intakeKcal: number }[];
  training: ReturnType<typeof trainingInteraction>;
}

/** Everything the goal shows for today, from the goal, the energy basis and the plan. */
export function goalSnapshot(input: {
  goal: GoalSettings;
  basis: EnergyBasis;
  sex: BodySex;
  trendKg: number;
  todayWorkoutKcal: number;
  /** Planned workout energy Monday … Sunday of this week. */
  plannedWeekKcal: readonly number[];
  /** 0 = Monday. */
  weekdayIndex: number;
  trend: readonly TrendPoint[];
  days: readonly EnergyDay[];
  today: string;
  week: {
    weekLoad: number;
    typicalWeekLoad: number;
    raceWeek: boolean;
    taper: boolean;
    keyDays: string[];
  };
}): GoalSnapshot {
  const { goal, basis } = input;
  const raw = goalTargets({
    kind: goal.kind,
    ratePerWeekKg: goal.ratePerWeekKg,
    tdeeKcal: basis.tdeeKcal,
    nonExerciseTdeeKcal: basis.nonExerciseKcal,
    bmrKcal: basis.bmrKcal,
    sex: input.sex,
    weightKg: input.trendKg,
  });
  // An accepted suggestion moves the targets; the floor still holds.
  const adjust = (kcal: number) => Math.max(raw.floorKcal, kcal + goal.adjustmentKcal);
  const targets = { ...raw, baseKcal: adjust(raw.baseKcal), dailyKcal: adjust(raw.dailyKcal) };
  const weekly = goal.weeklyMode
    ? weeklyPlan({
        baseKcal: targets.baseKcal,
        nonExerciseKcal: basis.nonExerciseKcal,
        plannedWorkoutKcal: input.plannedWeekKcal,
        eatBackPct: goal.eatBackPct,
        floorKcal: targets.floorKcal,
      })
    : null;
  const todayKcal = weekly
    ? (weekly.days[input.weekdayIndex] as number)
    : dayTarget({
        baseKcal: targets.baseKcal,
        workoutKcal: input.todayWorkoutKcal,
        eatBackPct: goal.eatBackPct,
      });
  const target = goal.targetWeightKg ?? input.trendKg;
  const reached = targetReached({ kind: goal.kind, targetKg: target, trendKg: input.trendKg });
  return {
    targets,
    todayKcal,
    addedBackKcal: Math.max(0, todayKcal - targets.baseKcal),
    weekly,
    forecast: goalForecast({
      kind: goal.kind,
      startKg: input.trendKg,
      targetKg: target,
      ratePerWeekKg: targets.ratePerWeekKg,
      trend: input.trend,
      today: input.today,
    }),
    checkIn:
      goal.kind === 'maintain'
        ? null
        : weeklyCheckIn({
            kind: goal.kind,
            plannedRatePerWeekKg: targets.effectiveRatePerWeekKg,
            trend: input.trend,
            today: input.today,
          }),
    plateau:
      goal.kind === 'lose'
        ? detectPlateau({ trend: input.trend, days: input.days, today: input.today })
        : {
            plateau: false,
            avgBalanceKcal: null,
            suggestions: [],
            dietBreakWeeks: G.plateau.dietBreakWeeks,
          },
    reached,
    reverseDiet:
      reached && goal.kind === 'lose'
        ? reverseDiet({
            currentKcal: targets.dailyKcal,
            maintenanceKcal: basis.tdeeKcal,
            today: input.today,
          })
        : [],
    training: trainingInteraction({ deficitKcal: Math.max(0, targets.deficitKcal), ...input.week }),
  };
}
