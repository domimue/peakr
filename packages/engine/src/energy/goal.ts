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
  /** Maintenance without sport: the wearable's day totals, else resting × everyday factor. */
  nonExerciseTdeeKcal: number;
  /**
   * Planned training per day (kcal, the week's planned sessions ÷ 7). The fixed daily target
   * includes it, and the floor is checked on that day – so planned sport counts. 0 without a plan.
   */
  plannedDailyKcal?: number;
  /** The intake floor's BMR: the formula (Mifflin-St Jeor / Katch-McArdle), never a device value. */
  bmrKcal: number;
  sex: BodySex;
  weightKg: number;
  reason?: TargetReason;
  /** Protein g per kg (1.6–2.2, default 1.9). */
  proteinGPerKg?: number;
}

export interface GoalTargets {
  /**
   * `belowFloor`: the chosen rate would push the daily target below max(BMR, 1,200 / 1,500 kcal).
   * The targets are then those of `proposedRatePerWeekKg` – the fastest rate that keeps the floor –
   * and the UI says so and offers it. Never a silently clamped number.
   */
  status: 'ok' | 'belowFloor';
  /** The rate asked for (after the max-rate limit). */
  requestedRatePerWeekKg: number;
  /** With `belowFloor`: the rate the targets use and the UI proposes. */
  proposedRatePerWeekKg: number | null;
  /** The rate the targets use. */
  ratePerWeekKg: number;
  /** Planned deficit per day (negative = surplus). */
  deficitKcal: number;
  /** The fixed daily target: maintenance without sport + planned training per day − deficit. */
  dailyKcal: number;
  /** Maintenance without sport − deficit (for reference; the target is `dailyKcal`). */
  baseKcal: number;
  floorKcal: number;
  /** Same as `status === 'belowFloor'` (kept for the existing screens). */
  floorApplied: boolean;
  /** The rate the targets really allow. */
  effectiveRatePerWeekKg: number;
  reason: TargetReason;
  protein: { gPerKg: number; grams: number };
}

/** Rates move in 0.05 kg steps; the proposal is the fastest step that keeps the floor. */
function floorRate(maintenanceKcal: number, floorKcal: number): number {
  const room = Math.max(0, maintenanceKcal - floorKcal);
  return Math.floor(round2(room / KCAL_PER_KG_PER_DAY / G.rateStep)) * G.rateStep;
}

/**
 * The fixed daily target = maintenance without sport + planned training per day − rate × 7,700 / 7
 * (surplus for gaining) – the same every day. It must stay at or above the floor; if the chosen
 * rate would break it, the result says so and carries the fastest rate that does not (CLAUDE.md
 * "Weight goal rules").
 */
export function goalTargets(input: GoalTargetsInput): GoalTargets {
  const max = maxRateFor(input.kind, input.weightKg);
  const requested = Math.min(Math.max(0, input.ratePerWeekKg), max);
  const floorKcal = intakeFloorKcal(input.sex, input.bmrKcal);
  const nonExercise = Math.round(input.nonExerciseTdeeKcal);
  const maintenance = nonExercise + Math.round(Math.max(0, input.plannedDailyKcal ?? 0));
  const losing = input.kind === 'lose';
  const belowFloor =
    losing && maintenance - Math.round(requested * KCAL_PER_KG_PER_DAY) < floorKcal;
  const rate = belowFloor ? round2(floorRate(maintenance, floorKcal)) : requested;
  const sign = input.kind === 'gain' ? 1 : -1;
  const perDay = Math.round(rate * KCAL_PER_KG_PER_DAY);
  // At maintenance itself below the floor (very small BMR), the floor still decides.
  const dailyKcal = Math.max(maintenance + sign * perDay, floorKcal);
  const deficitKcal = maintenance - dailyKcal;
  const clamped = (input.kind !== 'maintain' && requested < input.ratePerWeekKg) || belowFloor;
  return {
    status: belowFloor ? 'belowFloor' : 'ok',
    requestedRatePerWeekKg: round2(requested),
    proposedRatePerWeekKg: belowFloor ? rate : null,
    ratePerWeekKg: round2(rate),
    deficitKcal,
    dailyKcal,
    baseKcal: nonExercise - deficitKcal,
    floorKcal,
    floorApplied: belowFloor,
    effectiveRatePerWeekKg: round2(Math.abs(deficitKcal) / KCAL_PER_KG_PER_DAY),
    reason: clamped ? 'safety_clamp' : (input.reason ?? 'user'),
    protein: proteinForGoal({ weightKg: input.weightKg, gPerKg: input.proteinGPerKg }),
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
  nonExerciseTdeeKcal: number;
  /** Planned training per day (the floor is checked on the day with it). */
  plannedDailyKcal?: number;
  bmrKcal: number;
  sex: BodySex;
}): RatePreset[] {
  const maxRate = maxRateFor(input.kind, input.weightKg);
  return Object.entries(G.presets[input.kind]).map(([key, rate]) => {
    const enabled = rate <= maxRate + 1e-9;
    const t = goalTargets({ ...input, ratePerWeekKg: rate });
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

/** Protein per kg body weight, 1.8–2.0 by default (1.9), configurable within 1.6–2.2. */
export function proteinForGoal(input: { weightKg: number; gPerKg?: number }): {
  gPerKg: number;
  grams: number;
} {
  const { min, max, default: d } = C.macros.proteinGPerKg;
  const gPerKg = Math.round(Math.min(max, Math.max(min, input.gPerKg ?? d)) * 10) / 10;
  return { gPerKg, grams: Math.round(gPerKg * input.weightKg) };
}

/**
 * Actual training of the week so far against the plan: a hint when it is clearly off (±25 % and
 * at least 200 kcal). The target itself is not rewritten.
 */
export function trainingDeviation(input: { plannedSoFarKcal: number; actualSoFarKcal: number }): {
  hint: 'more' | 'less' | null;
  differenceKcal: number;
} {
  const t = C.trainingDeviation;
  const diff = Math.round(input.actualSoFarKcal - input.plannedSoFarKcal);
  const off = Math.abs(diff) >= t.minKcal && Math.abs(diff) > input.plannedSoFarKcal * t.share;
  return { hint: off ? (diff > 0 ? 'more' : 'less') : null, differenceKcal: diff };
}

/** How the daily target is built: resting + everyday + planned training per day − deficit. */
export interface TargetBreakdown {
  restingKcal: number;
  everydayKcal: number;
  /** The week's planned training ÷ 7. */
  trainingKcal: number;
  /** The deficit per day (negative = surplus). */
  deficitKcal: number;
  totalKcal: number;
}

export function targetBreakdown(input: {
  restingKcal: number;
  nonExerciseKcal: number;
  plannedDailyKcal: number;
  todayKcal: number;
}): TargetBreakdown {
  const restingKcal = Math.round(input.restingKcal);
  const everydayKcal = Math.round(input.nonExerciseKcal) - restingKcal;
  const trainingKcal = Math.round(Math.max(0, input.plannedDailyKcal));
  return {
    restingKcal,
    everydayKcal,
    trainingKcal,
    deficitKcal: restingKcal + everydayKcal + trainingKcal - input.todayKcal,
    totalKcal: input.todayKcal,
  };
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
  /**
   * Without sport: the mean day total (resting + active) of the wearable's days without training,
   * else resting × everyday-activity factor – plus the adaptive correction.
   */
  nonExerciseKcal: number;
  /** Resting energy as measured (device first) – shown in the breakdown. */
  restingKcal: number;
  /** The intake floor's BMR: the formula when given, else the resting energy. */
  bmrKcal: number;
  /** The everyday-activity factor (used only without enough wearable days). */
  everydayFactor: number;
  /** Where the day without sport comes from. */
  everydaySource: 'wearable' | 'factor';
  /** Wearable days without training the base was taken from (0 with the factor). */
  wearableDays: number;
  source: 'adaptive' | 'formula';
}

/** The everyday-activity factor of a level; unknown levels fall back to the default. */
export function everydayFactor(level: string | null | undefined): number {
  const table = C.everydayActivity as Record<string, number>;
  return (level ? table[level] : undefined) ?? C.everydayActivity[C.defaultEverydayActivity];
}

/**
 * The goal's basis from the last 14 days before today. A day without sport is what the wearable
 * measured on such days (resting + active, the active part at the target's activity share) once there are
 * enough of them – like the watch's own day total; otherwise resting energy × the everyday-activity
 * factor. The intake floor uses the formula BMR, never a device's resting value.
 */
export function energyBasis(input: {
  days: readonly ModelDayLike[];
  today: string;
  adaptive: AdaptiveResult;
  /** `C.everydayActivity` key, as the person answered. */
  everydayActivity?: string | null;
  /** Days with a completed workout – not a day without sport. */
  trainingDays?: readonly string[];
  /** Mifflin-St Jeor / Katch-McArdle for today – the floor's BMR. */
  formulaBmrKcal?: number;
}): EnergyBasis | null {
  const recent = input.days.filter(
    (d) => d.day < input.today && daysBetween(d.day, input.today) <= 14,
  );
  const pool = recent.length > 0 ? recent : input.days.filter((d) => d.day === input.today);
  if (pool.length === 0) return null;
  const mean = (list: readonly ModelDayLike[], f: (d: ModelDayLike) => number) =>
    list.reduce((s, d) => s + f(d), 0) / list.length;
  const resting = mean(pool, (d) => d.restingKcal);
  const factor = everydayFactor(input.everydayActivity);
  const training = new Set(input.trainingDays ?? []);
  const wearable = recent.filter(
    (d) => d.active?.neatSource === 'wearable' && !training.has(d.day),
  );
  const fromWearable = wearable.length >= G.wearableBaseMinDays;
  // The watch's active energy is stored at the device correction; the target counts it at its
  // own activity share.
  const activeShare = G.activeShare / C.deviceActiveShare;
  const nonExercise = fromWearable
    ? mean(wearable, (d) => d.restingKcal + d.activeKcal * activeShare)
    : resting * factor;
  const formula = mean(pool, (d) => d.restingKcal + d.activeKcal);
  const common = {
    restingKcal: Math.round(resting),
    bmrKcal: Math.round(input.formulaBmrKcal ?? resting),
    everydayFactor: factor,
    everydaySource: fromWearable ? ('wearable' as const) : ('factor' as const),
    wearableDays: fromWearable ? wearable.length : 0,
  };
  if (input.adaptive.status === 'ok') {
    return {
      ...common,
      tdeeKcal: input.adaptive.estimate.tdeeKcal,
      nonExerciseKcal: Math.round(nonExercise + input.adaptive.estimate.correctionKcal),
      source: 'adaptive',
    };
  }
  return {
    ...common,
    tdeeKcal: Math.round(Math.max(formula, nonExercise)),
    nonExerciseKcal: Math.round(nonExercise),
    source: 'formula',
  };
}

type ModelDayLike = Pick<ModelDay, 'day' | 'restingKcal' | 'activeKcal'> &
  Partial<Pick<ModelDay, 'active'>>;

export interface GoalSettings {
  kind: WeightGoalKind;
  targetWeightKg: number | null;
  ratePerWeekKg: number;
  /** @deprecated No effect: planned training is always part of the week's target. */
  eatBackPct?: number;
  /** @deprecated No effect: the daily target is the same every day. */
  weeklyMode?: boolean;
  /** Accepted check-in suggestions (kcal/day). */
  adjustmentKcal: number;
}

export interface GoalSnapshot {
  targets: GoalTargets;
  /** Today's target – the same every day of the week (fixed on Monday with the plan). */
  todayKcal: number;
  /** The week's planned training per day, already inside the target. */
  addedBackKcal: number;
  /** The week: 7 × the daily target. */
  weekly: { totalKcal: number; days: number[] };
  /** How today's target is built. */
  breakdown: TargetBreakdown;
  /** Actual training this week clearly off the plan: a hint, the target stays. */
  deviation: ReturnType<typeof trainingDeviation>;
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
  /** Planned workout energy Monday … Sunday of this week. */
  plannedWeekKcal: readonly number[];
  /**
   * Planned training per day (full estimate) the goal's rate is checked on – the lowest week of the
   * next weeks, so the rate holds in a recovery week too. Default: this week's.
   */
  ratePlannedDailyKcal?: number;
  /** Completed workout energy of this week up to today (for the deviation hint). */
  actualWeekKcalSoFar?: number;
  /** 0 = Monday. */
  weekdayIndex: number;
  trend: readonly TrendPoint[];
  days: readonly EnergyDay[];
  today: string;
  /** Protein g per kg (default 1.9). */
  proteinGPerKg?: number;
  week: {
    weekLoad: number;
    typicalWeekLoad: number;
    raceWeek: boolean;
    taper: boolean;
    keyDays: string[];
  };
}): GoalSnapshot {
  const { goal, basis } = input;
  // The target counts planned training at the activity share (the rest is a buffer).
  const share = G.activeShare;
  const weekPlanned = input.plannedWeekKcal.reduce((a, b) => a + Math.max(0, b), 0);
  const plannedDaily = Math.round((weekPlanned * share) / 7);
  const ratePlanned =
    input.ratePlannedDailyKcal === undefined
      ? plannedDaily
      : Math.round(input.ratePlannedDailyKcal * share);
  const raw = goalTargets({
    kind: goal.kind,
    ratePerWeekKg: goal.ratePerWeekKg,
    nonExerciseTdeeKcal: basis.nonExerciseKcal,
    plannedDailyKcal: Math.min(plannedDaily, ratePlanned),
    bmrKcal: basis.bmrKcal,
    sex: input.sex,
    weightKg: input.trendKg,
    ...(input.proteinGPerKg !== undefined ? { proteinGPerKg: input.proteinGPerKg } : {}),
  });
  // An accepted suggestion moves the targets; the floor still holds. This week's own planned
  // training (at least the week the rate was checked on) is in the daily target.
  const adjust = (kcal: number) => Math.max(raw.floorKcal, kcal + goal.adjustmentKcal);
  const todayKcal = adjust(basis.nonExerciseKcal + plannedDaily - raw.deficitKcal);
  const targets = { ...raw, baseKcal: adjust(raw.baseKcal), dailyKcal: todayKcal };
  const weekly = { totalKcal: 7 * todayKcal, days: Array.from({ length: 7 }, () => todayKcal) };
  const plannedSoFar = input.plannedWeekKcal
    .slice(0, input.weekdayIndex + 1)
    .reduce((a, b) => a + Math.max(0, b), 0);
  const target = goal.targetWeightKg ?? input.trendKg;
  const reached = targetReached({ kind: goal.kind, targetKg: target, trendKg: input.trendKg });
  return {
    targets,
    todayKcal,
    addedBackKcal: plannedDaily,
    weekly,
    breakdown: targetBreakdown({
      restingKcal: basis.restingKcal,
      nonExerciseKcal: basis.nonExerciseKcal,
      plannedDailyKcal: plannedDaily,
      todayKcal,
    }),
    deviation:
      input.actualWeekKcalSoFar === undefined
        ? { hint: null, differenceKcal: 0 }
        : trainingDeviation({
            plannedSoFarKcal: plannedSoFar,
            actualSoFarKcal: input.actualWeekKcalSoFar,
          }),
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
