import {
  bodyIndices,
  forecastLines,
  goalProgress,
  measurementTrends,
  scaleReasons,
  statusOf,
  trainingWeek,
  trendChange,
  weeklyCoach,
  weeklyEnergyBars,
  weekLoadContext,
  type BodyIndices,
  type CoachSummary,
  type CoachTraining,
  type ForecastPoint,
  type MeasurementTrend,
  type PlanState,
  type ScaleReason,
  type TrainingWeek,
  type TrendPoint,
  type WeekEnergyBar,
} from '@peakr/engine';

import { todayIso } from '@/data/ids';
import { usePlan } from '@/features/plan/queries';

import { useBodyModel, type BodyModel } from './model';
import { useBodyProfile } from './profile';
import { useMeasurements } from './queries';

/**
 * Body → Progress dashboard: collects the model, the check-ins and Teil A's plan and hands them
 * to the engine's dashboard and coach functions. Nothing is computed here.
 */

/** How far back the trend chart looks. */
const CHART_DAYS = 90;

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (iso: string) => shift(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

export interface BodyDashboard {
  model: BodyModel;
  kpis: {
    trendKg: number | null;
    sinceStartKg: number | null;
    lastWeekKg: number | null;
    bodyFatPct: number | null;
    waistCm: number | null;
    goalPct: number | null;
  };
  chart: {
    trend: TrendPoint[];
    targetKg: number | null;
    planned: ForecastPoint[];
    real: ForecastPoint[];
  };
  bars: WeekEnergyBar[];
  scaleReasons: ScaleReason[];
  indices: BodyIndices | null;
  measurements: MeasurementTrend[];
  training: TrainingWeek | null;
  coach: CoachSummary;
}

function weekOf(state: PlanState, monday: string) {
  const week = state.plan.weeks.find((w) => w.startDate === monday);
  return (week?.workouts ?? []).map((w) => ({
    sport: w.sport,
    status: statusOf(state, w.id),
    durationMin: w.durationMin,
  }));
}

function coachTraining(state: PlanState, monday: string): CoachTraining {
  const t = trainingWeek(weekOf(state, monday));
  const load = weekLoadContext(state.plan.weeks, monday);
  return {
    done: t.done,
    planned: t.planned,
    strengthDone: t.groups.strength.done,
    load: load.weekLoad,
    typicalLoad: load.typicalWeekLoad,
  };
}

export function useBodyDashboard(): BodyDashboard | null {
  const model = useBodyModel();
  const checkIns = useMeasurements();
  const profile = useBodyProfile();
  const plan = usePlan();
  if (!model) return null;
  const today = todayIso();
  const { trend, goal, goalSnapshot: snap } = model;
  const first = trend[0];
  const last = trend.at(-1);
  const measurements = measurementTrends(checkIns.data ?? []);
  const latest = (key: string) => measurements.find((m) => m.key === key)?.currentCm ?? null;
  const waistCm = latest('waist') ?? latest('belly');
  const targetKg = goal && goal.kind !== 'maintain' ? goal.targetWeightKg : null;
  const lines =
    goal && snap && last
      ? forecastLines({
          kind: goal.kind,
          fromKg: last.trendKg,
          today,
          targetKg,
          plannedRatePerWeekKg: snap.targets.effectiveRatePerWeekKg,
          realPaceKgPerWeek: snap.forecast.realPaceKgPerWeek,
        })
      : { planned: [], real: [] };
  const stored = plan.data;
  const monday = mondayOf(today);
  const p = profile.data?.values;
  const goalPct =
    targetKg !== null && goal && last
      ? goalProgress({ startKg: goal.startWeightKg, targetKg, currentKg: last.trendKg })
      : null;

  return {
    model,
    kpis: {
      trendKg: last?.trendKg ?? null,
      sinceStartKg: first && last ? trendChange(trend, first.date, last.date, 0) : null,
      lastWeekKg: trendChange(trend, shift(today, -7), today),
      bodyFatPct: model.bodyFatPoints.at(-1)?.bodyFatPct ?? null,
      waistCm,
      goalPct,
    },
    chart: {
      trend: trend.filter((t) => t.date >= shift(today, -CHART_DAYS)),
      targetKg,
      planned: lines.planned,
      real: lines.real,
    },
    bars: weeklyEnergyBars(model.days, today, 8),
    scaleReasons: scaleReasons(model.scale),
    indices:
      p?.sex && p.heightCm
        ? bodyIndices({
            sex: p.sex,
            heightCm: p.heightCm,
            weightKg: last?.trendKg ?? p.weightKg ?? null,
            waistCm,
            hipCm: latest('hip'),
          })
        : null,
    measurements,
    training: stored ? trainingWeek(weekOf(stored.state, monday)) : null,
    coach: weeklyCoach({
      today,
      goal:
        goal && !goal.paused
          ? { kind: goal.kind, startKg: goal.startWeightKg, targetKg: goal.targetWeightKg }
          : null,
      trendKg: last?.trendKg ?? null,
      trend,
      days: model.days,
      incompleteDays: model.incompleteDays,
      proteinByDay: model.proteinByDay,
      proteinTargetG: snap?.targets.protein.grams ?? null,
      checkIn: snap?.checkIn ?? null,
      plateau: snap?.plateau.plateau ?? false,
      tooFastLoss: model.tooFastLoss,
      training: stored
        ? {
            lastWeek: coachTraining(stored.state, shift(monday, -7)),
            nextWeek: coachTraining(stored.state, monday),
          }
        : null,
    }),
  };
}
