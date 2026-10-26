import type { Result, ValidationIssue } from '../result';

import { energyConfig as C } from './config';
import { ageOn, intakeFloorKcal, type BodySex } from './energy';
import { daysBetween } from './energy';
import type { TrendPoint } from './trend';

/**
 * CLAUDE.md "Weight goal rules", enforced here and nowhere else. No function takes an option to
 * relax a rule: settings cannot override them.
 */

export type WeightGoalKind = 'lose' | 'maintain' | 'gain';
export type TargetReason = 'user' | 'adaptive' | 'safety_clamp';

export interface WeightGoalInput {
  kind: WeightGoalKind;
  targetWeightKg?: number;
  ratePerWeekKg?: number;
  sex: BodySex;
  birthDate: string;
  heightCm: number;
  /** Smoothed trend weight. */
  trendWeightKg: number;
  today: string;
}

export type WeightGoalField = 'kind' | 'targetWeightKg' | 'ratePerWeekKg';

export interface WeightGoal {
  kind: WeightGoalKind;
  targetWeightKg: number | null;
  /** Always positive; the direction is `kind`. 0 for maintain. */
  ratePerWeekKg: number;
  /** `safety_clamp` when the rate was lowered to the limit. */
  reason: TargetReason;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function bmiOf(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** 1 % of body weight per week, never more than 1.0 kg. */
export function maxLossRatePerWeekKg(weightKg: number): number {
  return round2(Math.min(weightKg * C.goal.maxLossShare, C.goal.maxLossKgPerWeek));
}

export function validateWeightGoal(input: WeightGoalInput): Result<WeightGoal, WeightGoalField> {
  const issues: ValidationIssue<WeightGoalField>[] = [];
  if (input.kind === 'maintain') {
    return {
      ok: true,
      value: { kind: 'maintain', targetWeightKg: null, ratePerWeekKg: 0, reason: 'user' },
    };
  }
  if (ageOn(input.birthDate, input.today) < C.goal.minAgeForChange) {
    issues.push({ field: 'kind', code: 'underageWeightLoss' });
    return { ok: false, issues };
  }
  const target = input.targetWeightKg;
  if (target === undefined || !Number.isFinite(target)) {
    issues.push({ field: 'targetWeightKg', code: 'required' });
  } else if (input.kind === 'lose') {
    if (bmiOf(input.trendWeightKg, input.heightCm) < C.goal.minBmi) {
      issues.push({ field: 'kind', code: 'bmiTooLow' });
    } else if (target >= input.trendWeightKg) {
      issues.push({ field: 'targetWeightKg', code: 'targetNotBelowCurrent' });
    } else if (bmiOf(target, input.heightCm) < C.goal.minBmi) {
      issues.push({
        field: 'targetWeightKg',
        code: 'bmiTooLow',
        params: { min: Math.ceil(C.goal.minBmi * (input.heightCm / 100) ** 2 * 10) / 10 },
      });
    }
  } else if (target <= input.trendWeightKg) {
    issues.push({ field: 'targetWeightKg', code: 'targetNotAboveCurrent' });
  }
  const rate = input.ratePerWeekKg;
  if (rate === undefined || !(rate > 0)) issues.push({ field: 'ratePerWeekKg', code: 'required' });
  if (issues.length > 0 || rate === undefined || target === undefined) return { ok: false, issues };
  const max =
    input.kind === 'lose' ? maxLossRatePerWeekKg(input.trendWeightKg) : C.goal.maxGainKgPerWeek;
  return {
    ok: true,
    value: {
      kind: input.kind,
      targetWeightKg: target,
      ratePerWeekKg: Math.min(rate, max),
      reason: rate > max ? 'safety_clamp' : 'user',
    },
  };
}

export interface IntakeTarget {
  intakeKcal: number;
  /** Planned deficit (loss) or surplus (gain) per day, after the floor. */
  deficitKcal: number;
  /** The intake floor raised the target – the UI shows a warning, never a lower number. */
  floorApplied: boolean;
  /** The weekly rate the target actually allows. */
  effectiveRatePerWeekKg: number;
  reason: TargetReason;
}

/**
 * Daily intake for a goal: TDEE ∓ rate × 7,700 / 7, never below max(BMR, 1,200 kcal women /
 * 1,500 kcal men). `reason` is `safety_clamp` when the floor decided.
 */
export function intakeTarget(input: {
  tdeeKcal: number;
  bmrKcal: number;
  sex: BodySex;
  kind: WeightGoalKind;
  ratePerWeekKg?: number;
  reason?: TargetReason;
}): IntakeTarget {
  const rate = input.kind === 'maintain' ? 0 : Math.max(0, input.ratePerWeekKg ?? 0);
  const perDay = Math.round((rate * C.kcalPerKgFat) / 7);
  const sign = input.kind === 'gain' ? 1 : -1;
  const wanted = Math.round(input.tdeeKcal + sign * perDay);
  const floor = intakeFloorKcal(input.sex, input.bmrKcal);
  const intakeKcal = Math.max(wanted, floor);
  const floorApplied = wanted < floor;
  const deficitKcal = Math.abs(Math.round(input.tdeeKcal) - intakeKcal);
  return {
    intakeKcal,
    deficitKcal: input.kind === 'maintain' ? 0 : deficitKcal,
    floorApplied,
    effectiveRatePerWeekKg: round2(
      ((input.kind === 'maintain' ? 0 : deficitKcal) * 7) / C.kcalPerKgFat,
    ),
    reason: floorApplied ? 'safety_clamp' : (input.reason ?? 'user'),
  };
}

export interface TargetChange {
  date: string;
  intakeKcal: number;
  reason: TargetReason;
}

/** The change to store when the target moved (every change keeps its reason), else null. */
export function nextTargetChange(
  previous: TargetChange | null,
  next: { intakeKcal: number; reason: TargetReason },
  date: string,
): TargetChange | null {
  if (previous && previous.intakeKcal === next.intakeKcal) return null;
  return { date, intakeKcal: next.intakeKcal, reason: next.reason };
}

/**
 * The trend fell faster than the max rate over the last two weeks: a gentle warning (eat a bit
 * more), never praise.
 */
export function tooFastLoss(
  trend: readonly TrendPoint[],
  today: string,
): { warning: boolean; ratePerWeekKg: number | null } {
  const days = C.goal.fastLossWeeks * 7;
  const recent = trend.filter((p) => p.date <= today && daysBetween(p.date, today) <= days);
  const first = recent[0];
  const last = recent.at(-1);
  if (!first || !last || daysBetween(first.date, last.date) < 7) {
    return { warning: false, ratePerWeekKg: null };
  }
  const lossPerWeek = ((first.trendKg - last.trendKg) * 7) / daysBetween(first.date, last.date);
  return {
    warning: lossPerWeek > maxLossRatePerWeekKg(first.trendKg),
    ratePerWeekKg: round2(lossPerWeek),
  };
}

/** Protein during weight loss: 1.6–2.2 g per kg; no target for other goals. */
export function proteinTargetG(
  weightKg: number,
  kind: WeightGoalKind,
): { minG: number; maxG: number } | null {
  if (kind !== 'lose') return null;
  const { min, max } = C.goal.proteinGPerKg;
  return { minG: Math.round(weightKg * min), maxG: Math.round(weightKg * max) };
}
