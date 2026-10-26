import { daysBetween } from '../energy/energy';
import { dayBalance, isLogged, type EnergyDay } from '../energy/balance';
import { energyConfig as C } from '../energy/config';
import type { CheckInStatus } from '../energy/goal';
import type { TrendPoint } from '../energy/trend';
import { goalProgress, trendChange } from './dashboard';

/**
 * The weekly coach of the Body add-on: last week in numbers, what went well, what to watch, and
 * one to three concrete adjustments for next week that combine Teil A's training load with
 * nutrition and body data. Deterministic rules on the data – the UI only translates the keys.
 * Suggestions only: nothing changes until the user accepts it, and the wording never praises a
 * fast loss or shames a gain (CLAUDE.md "Weight goal rules").
 */

export interface CoachTraining {
  /** Sessions of the week (Teil A plan), skipped ones left out. */
  done: number;
  planned: number;
  strengthDone: number;
  /** Planned load of the week and a typical week (same units as the plan). */
  load: number;
  typicalLoad: number;
}

export interface CoachInput {
  today: string;
  goal: {
    kind: 'lose' | 'maintain' | 'gain';
    startKg: number;
    targetKg: number | null;
  } | null;
  trendKg: number | null;
  trend: readonly TrendPoint[];
  days: readonly EnergyDay[];
  /** Days the user marked as incomplete. */
  incompleteDays: readonly string[];
  /** Logged protein per day (only days with diary entries). */
  proteinByDay: readonly { day: string; proteinG: number }[];
  proteinTargetG: number | null;
  checkIn: {
    status: CheckInStatus;
    actualRatePerWeekKg: number | null;
    adjustmentKcal: number;
  } | null;
  plateau: boolean;
  tooFastLoss: boolean;
  /** Last week and the coming week of the plan; null without a plan. */
  training: { lastWeek: CoachTraining; nextWeek: CoachTraining } | null;
}

export type CoachPoint =
  | { key: 'logging'; days: number }
  | { key: 'onPace'; rate: number }
  | { key: 'stable' }
  | { key: 'protein'; grams: number; target: number }
  | { key: 'training'; done: number; planned: number }
  | { key: 'strength'; sessions: number };

export type CoachWatch =
  | { key: 'fewLogs'; days: number }
  | { key: 'proteinLow'; grams: number; target: number }
  | { key: 'fastPace'; rate: number | null }
  | { key: 'slowPace'; rate: number }
  | { key: 'missedSessions'; done: number; planned: number }
  | { key: 'hardWeekAhead'; share: number };

export type CoachAdjustment =
  | { kind: 'kcal'; kcal: number; reason: 'checkIn' | 'tooFast' | 'hardWeek' }
  | { kind: 'protein'; grams: number }
  | { kind: 'strength'; sessions: number }
  | { kind: 'logging'; days: number };

export type CoachHint = 'plateau' | 'tooFastLoss' | 'incompleteData';

export interface CoachSummary {
  /** Monday of the week the summary looks back on. */
  week: string;
  progressPct: number | null;
  lastWeek: {
    trendChangeKg: number | null;
    avgIntakeKcal: number | null;
    avgBalanceKcal: number | null;
    fatKg: number | null;
    loggedDays: number;
    weighInDays: number;
    sessionsDone: number | null;
    sessionsPlanned: number | null;
  };
  wentWell: CoachPoint[];
  watch: CoachWatch[];
  adjustments: CoachAdjustment[];
  hints: CoachHint[];
}

export const coachConfig = {
  goodLoggingDays: 6,
  fewLoggingDays: 4,
  loggingTargetDays: 5,
  minWeighInDays: 3,
  proteinGood: 0.9,
  proteinLow: 0.8,
  missedShare: 0.75,
  /** A week this much above a typical one counts as hard. */
  hardWeekShare: 1.15,
  /** Extra intake in a hard week while losing (within the ±150 kcal weekly limit). */
  hardWeekKcal: 100,
  tooFastKcal: 150,
  minStrengthSessions: 2,
  stableKg: 0.3,
  maxAdjustments: 3,
};

const r2 = (n: number) => Math.round(n * 100) / 100;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Monday of the week before today's. */
const lastMonday = (today: string) => {
  const d = new Date(`${today}T00:00:00Z`);
  return addDays(today, -((d.getUTCDay() + 6) % 7) - 7);
};

export function weeklyCoach(input: CoachInput): CoachSummary {
  const K = coachConfig;
  const week = lastMonday(input.today);
  const inWeek = (day: string) => {
    const off = daysBetween(week, day);
    return off >= 0 && off < 7;
  };
  const days = input.days.filter((d) => inWeek(d.day));
  const logged = days.filter(isLogged);
  const balance = logged.reduce((s, d) => s + (dayBalance(d) as number), 0);
  const weighInDays = new Set(input.trend.filter((p) => inWeek(p.date)).map((p) => p.date)).size;
  const protein = input.proteinByDay.filter(
    (p) => inWeek(p.day) && logged.some((d) => d.day === p.day),
  );
  const avgProtein = protein.length
    ? Math.round(protein.reduce((s, p) => s + p.proteinG, 0) / protein.length)
    : null;
  const proteinShare =
    avgProtein !== null && input.proteinTargetG ? avgProtein / input.proteinTargetG : null;
  const goal = input.goal;
  const losing = goal?.kind === 'lose';
  const changing = goal !== null && goal.kind !== 'maintain';
  const last = input.training?.lastWeek ?? null;
  const next = input.training?.nextWeek ?? null;
  const change = trendChange(input.trend, addDays(week, -1), addDays(week, 6));
  const hardNext =
    next !== null && next.typicalLoad > 0 && next.load > next.typicalLoad * K.hardWeekShare;
  const checkIn = input.checkIn;

  const wentWell: CoachPoint[] = [];
  if (logged.length >= K.goodLoggingDays) wentWell.push({ key: 'logging', days: logged.length });
  if (checkIn?.status === 'onTrack' && checkIn.actualRatePerWeekKg !== null && !input.tooFastLoss)
    wentWell.push({ key: 'onPace', rate: checkIn.actualRatePerWeekKg });
  if (goal?.kind === 'maintain' && change !== null && Math.abs(change) <= K.stableKg)
    wentWell.push({ key: 'stable' });
  if (proteinShare !== null && proteinShare >= K.proteinGood)
    wentWell.push({
      key: 'protein',
      grams: avgProtein as number,
      target: input.proteinTargetG as number,
    });
  if (last && last.planned > 0 && last.done >= last.planned)
    wentWell.push({ key: 'training', done: last.done, planned: last.planned });
  if (last && last.strengthDone >= K.minStrengthSessions)
    wentWell.push({ key: 'strength', sessions: last.strengthDone });

  const watch: CoachWatch[] = [];
  if (logged.length < K.fewLoggingDays) watch.push({ key: 'fewLogs', days: logged.length });
  if (proteinShare !== null && proteinShare < K.proteinLow)
    watch.push({
      key: 'proteinLow',
      grams: avgProtein as number,
      target: input.proteinTargetG as number,
    });
  if (input.tooFastLoss || checkIn?.status === 'tooFast')
    watch.push({ key: 'fastPace', rate: checkIn?.actualRatePerWeekKg ?? null });
  else if (checkIn?.status === 'tooSlow' && checkIn.actualRatePerWeekKg !== null)
    watch.push({ key: 'slowPace', rate: checkIn.actualRatePerWeekKg });
  if (last && last.planned > 0 && last.done < last.planned * K.missedShare)
    watch.push({ key: 'missedSessions', done: last.done, planned: last.planned });
  if (hardNext && losing)
    watch.push({
      key: 'hardWeekAhead',
      share: Math.round(((next as CoachTraining).load / (next as CoachTraining).typicalLoad) * 100),
    });

  const adjustments: CoachAdjustment[] = [];
  const fewLogs = logged.length < K.fewLoggingDays;
  // Unreliable logs first: everything else depends on them.
  if (fewLogs) adjustments.push({ kind: 'logging', days: K.loggingTargetDays });
  if (input.tooFastLoss && changing)
    adjustments.push({
      kind: 'kcal',
      kcal: Math.max(K.tooFastKcal, checkIn?.adjustmentKcal ?? 0),
      reason: 'tooFast',
    });
  else if (checkIn && checkIn.adjustmentKcal !== 0)
    adjustments.push({ kind: 'kcal', kcal: checkIn.adjustmentKcal, reason: 'checkIn' });
  else if (hardNext && losing)
    adjustments.push({ kind: 'kcal', kcal: K.hardWeekKcal, reason: 'hardWeek' });
  if (proteinShare !== null && proteinShare < K.proteinGood)
    adjustments.push({ kind: 'protein', grams: input.proteinTargetG as number });
  if (changing && last && last.strengthDone < K.minStrengthSessions)
    adjustments.push({ kind: 'strength', sessions: K.minStrengthSessions });
  if (!fewLogs && logged.length < K.loggingTargetDays)
    adjustments.push({ kind: 'logging', days: K.loggingTargetDays });

  const hints: CoachHint[] = [];
  if (input.plateau) hints.push('plateau');
  if (input.tooFastLoss) hints.push('tooFastLoss');
  if (fewLogs || weighInDays < K.minWeighInDays || input.incompleteDays.some(inWeek))
    hints.push('incompleteData');

  return {
    week,
    progressPct:
      changing && goal.targetKg !== null && input.trendKg !== null
        ? goalProgress({ startKg: goal.startKg, targetKg: goal.targetKg, currentKg: input.trendKg })
        : null,
    lastWeek: {
      trendChangeKg: change,
      avgIntakeKcal: logged.length
        ? Math.round(logged.reduce((s, d) => s + (d.intakeKcal as number), 0) / logged.length)
        : null,
      avgBalanceKcal: logged.length ? Math.round(balance / logged.length) : null,
      fatKg: logged.length ? r2(balance / C.kcalPerKgFat) : null,
      loggedDays: logged.length,
      weighInDays,
      sessionsDone: last?.done ?? null,
      sessionsPlanned: last?.planned ?? null,
    },
    wentWell,
    watch,
    adjustments: adjustments.slice(0, K.maxAdjustments),
    hints,
  };
}
