import {
  adaptiveTdee,
  allWorkouts,
  completedWorkoutKcal,
  energyBasis,
  estimateWorkoutKcal,
  goalSnapshot,
  weekLoadContext,
  weekTags,
  fuellingHints,
  macroTargets,
  type FuellingHint,
  sumNutrients,
  type ActivitySport,
  type EnergyBasis,
  type MacroTargets,
  type Nutrients,
  type GoalSnapshot,
  bodyComposition,
  calculationVsScale,
  energyDays,
  intakeTarget,
  nextTargetChange,
  statusOf,
  rapidLossWarning,
  recentBodyFat,
  restingEnergy,
  trendOn,
  weekBalance,
  type AdaptiveResult,
  type BodyComposition,
  type BodySource,
  type ModelDay,
  type ScaleComparison,
  type SourcedValue,
  type TrendPoint,
  type WeekBalance,
} from '@peakr/engine';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { daysBetween, todayIso } from '@/data/ids';
import { listActivities } from '@/data/repositories/activity-repository';
import * as repo from '@/data/repositories/body-repository';
import { getDailyValues } from '@/data/repositories/health-repository';
import { useEntitlement } from '@/features/billing/billing-store';
import { usePlan } from '@/features/plan/queries';

import { DEFAULT_ENERGY_SETTINGS, type EnergySettings } from './energy-settings';
import { useBodyProfile } from './profile';
import { bodyKeys, useEnergySettings } from './queries';

/**
 * The Body add-on's energy model: gathers every source (diary and check-ins, Garmin through the
 * health sync, Health Connect / HealthKit values read for Body, Teil A's activities and plan) and
 * hands them to the engine, which applies the source priority and does all the maths. This file
 * only collects and stores; it computes nothing itself.
 */

/** Days the model looks back (adaptive TDEE uses 28, the weekly comparison up to 8 weeks). */
const WINDOW_DAYS = 56;

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const mondayOf = (iso: string) => shift(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

export interface BodyModel {
  today: ModelDay;
  /** Today's intake target (maintenance with today's energy, never below the floor). */
  targetKcal: number;
  remainingKcal: number;
  floorApplied: boolean;
  /** Adaptive correction added to the formula estimate (0 until there is an estimate). */
  correctionKcal: number;
  thisWeek: WeekBalance;
  lastWeek: WeekBalance;
  trend: TrendPoint[];
  adaptive: AdaptiveResult;
  scale: ScaleComparison;
  composition: BodyComposition;
  tooFastLoss: boolean;
  /** Maintenance used for targets (adaptive once available, else formula). */
  basis: EnergyBasis | null;
  /** Planned training per day the goal's rate is checked on (lowest of the next four weeks). */
  goalPlannedDailyKcal: number;
  /** The latest trend weight (else the profile weight). */
  trendKg: number;
  /** Current goal version (null = none yet). Paused goals count as "maintain". */
  goal: repo.StoredGoal | null;
  goalSnapshot: GoalSnapshot | null;
  /** The week's planned training per day inside the target (without a goal: today's workouts). */
  addedBack: { kcal: number };
  /** What was eaten today and the macro targets for the rings. */
  eaten: Nutrients;
  macros: MacroTargets;
  /** Optional fuelling hints for long planned sessions today and tomorrow. */
  fuelling: FuellingHint[];
  /** How today's target is built (resting, everyday, training, deficit). */
  breakdown: GoalSnapshot['breakdown'] | null;
  /** This week's actual training clearly off the plan: a hint, the target stays. */
  deviation: GoalSnapshot['deviation'] | null;
  /** The goal's rate would break the intake floor: the rate asked for and the one proposed. */
  belowFloor: { requested: number; proposed: number } | null;
  /** The person's everyday activity and macro settings (defaults until set). */
  energy: EnergySettings;
  /** The model's days (window up to today), for the dashboard and the coach. */
  days: ModelDay[];
  incompleteDays: string[];
  /** Logged protein per day (days with at least one entry that has protein). */
  proteinByDay: { day: string; proteinG: number }[];
  /** Body fat values with their day (all sources), oldest first. */
  bodyFatPoints: { day: string; bodyFatPct: number }[];
}

interface RawInputs {
  food: repo.FoodEntry[];
  checkIns: repo.CheckIn[];
  device: repo.DeviceBodyValue[];
  garmin: { metric: string; day: string; value: number; source: BodySource }[];
  activities: Awaited<ReturnType<typeof listActivities>>;
  incompleteDays: string[];
  estimates: repo.StoredTdeeEstimate[];
  targets: repo.StoredTargetChange[];
  goals: repo.StoredGoal[];
  dayKcal: repo.DayKcal[];
  measurements: repo.Measurement[];
}

/** Body fat of a check-in as a sourced value: a Navy result is an estimate, a scale is a device. */
const FAT_SOURCE = { manual: 'manual', navy: 'estimate', scale: 'healthConnect' } as const;

async function loadInputs(from: string): Promise<RawInputs> {
  const [
    food,
    checkIns,
    device,
    health,
    activities,
    incompleteDays,
    estimates,
    targets,
    goals,
    dayKcal,
    measurements,
  ] = await Promise.all([
    repo.listFood(),
    repo.listCheckIns(),
    repo.listDeviceValues(from),
    getDailyValues({
      metrics: ['weight', 'body_fat', 'active_kcal', 'resting_kcal', 'steps'],
      from,
    }).catch(() => []),
    listActivities().catch(() => []),
    repo.listIncompleteDays(),
    repo.listTdeeEstimates(),
    repo.listTargetChanges(),
    repo.listGoals(),
    repo.listDayKcal(),
    repo.listMeasurements(),
  ]);
  return {
    food: food.filter((f) => f.day >= from),
    checkIns,
    device,
    garmin: health.map((h) => ({ metric: h.metric, day: h.day, value: h.value, source: h.source })),
    activities: activities.filter((a) => a.date >= from),
    incompleteDays,
    estimates,
    targets,
    goals,
    dayKcal: dayKcal.filter((d) => d.day >= from),
    measurements,
  };
}

/** Body fat values from weigh-ins and check-ins. */
function bodyFatValues(raw: RawInputs): SourcedValue[] {
  return [
    ...raw.checkIns
      .filter((c) => c.bodyFatPct !== null)
      .map((c) => ({ day: c.day, source: 'manual' as const, value: c.bodyFatPct as number })),
    ...raw.measurements
      .filter((m) => m.bodyFatPct !== null)
      .map((m) => ({
        day: m.day,
        source: FAT_SOURCE[m.bodyFatSource ?? 'manual'],
        value: m.bodyFatPct as number,
      })),
  ];
}

function sourced(raw: RawInputs, metric: string): SourcedValue[] {
  return [
    ...raw.device
      .filter((d) => d.metric === metric)
      .map((d) => ({ day: d.day, source: d.source, value: d.value })),
    ...raw.garmin
      .filter((g) => g.metric === metric)
      .map((g) => ({ day: g.day, source: g.source, value: g.value })),
  ];
}

export function useBodyModel(): BodyModel | null {
  const guard = useEntitlement('body_nutrition');
  const profile = useBodyProfile();
  const plan = usePlan();
  const today = todayIso();
  const from = shift(today, -WINDOW_DAYS);
  const energySettings = useEnergySettings();
  const inputs = useQuery({
    queryKey: [...bodyKeys.all, 'model', from],
    queryFn: () => loadInputs(from),
    enabled: guard.canRead,
  });

  const model = useMemo((): (BodyModel & { raw: RawInputs }) | null => {
    const raw = inputs.data;
    const p = profile.data?.profile;
    if (!raw || !p) return null;
    const intakeByDay = new Map<string, number>();
    for (const f of raw.food) intakeByDay.set(f.day, (intakeByDay.get(f.day) ?? 0) + f.kcal);
    // The quick kcal entry counts on days without diary entries (the diary is more precise).
    for (const d of raw.dayKcal)
      if (d.intakeKcal !== null && !intakeByDay.has(d.day)) intakeByDay.set(d.day, d.intakeKcal);
    const stored = plan.data;
    const planned = stored
      ? allWorkouts(stored.state.plan)
          .filter((w) => w.date >= from && w.date <= today)
          .map((w) => ({
            day: w.date,
            workout: {
              sport: w.sport,
              intensity: w.intensity,
              durationMin: w.durationMin,
              status: statusOf(stored.state, w.id),
            },
          }))
      : [];
    const { days, trend } = energyDays({
      profile: p,
      from,
      to: today,
      today,
      intake: [
        ...[...intakeByDay.entries()].map(([day, value]) => ({
          day,
          source: 'manual' as const,
          value,
        })),
        ...sourced(raw, 'intake_kcal'),
      ],
      restingKcal: sourced(raw, 'resting_kcal'),
      activeKcal: [
        ...raw.dayKcal
          .filter((d) => d.activeKcal !== null)
          .map((d) => ({ day: d.day, source: 'manual' as const, value: d.activeKcal as number })),
        ...sourced(raw, 'active_kcal'),
      ],
      workoutKcal: sourced(raw, 'workout_kcal'),
      steps: sourced(raw, 'steps'),
      weight: [
        ...raw.checkIns.map((c) => ({ day: c.day, source: 'manual' as const, value: c.weightKg })),
        ...sourced(raw, 'weight'),
      ],
      bodyFat: [...bodyFatValues(raw), ...sourced(raw, 'body_fat')],
      completed: raw.activities.map((a) => ({
        day: a.date,
        workout: { sport: a.sport, durationMin: a.durationSec / 60, avgHr: a.avgHr },
      })),
      planned,
      incompleteDays: raw.incompleteDays,
    });
    const previous = raw.estimates.filter((e) => e.date < today).at(-1) ?? null;
    const adaptive = adaptiveTdee({ days, trend, today, previous });
    const correctionKcal =
      adaptive.status === 'ok'
        ? adaptive.estimate.correctionKcal
        : (raw.estimates.at(-1)?.correctionKcal ?? 0);
    const todayDay = days.at(-1) as ModelDay;
    const energy = energySettings.data ?? DEFAULT_ENERGY_SETTINGS;
    const maintenance = intakeTarget({
      tdeeKcal: todayDay.restingKcal + todayDay.activeKcal + correctionKcal,
      bmrKcal: todayDay.restingKcal,
      sex: p.sex,
      kind: 'maintain',
    });
    const monday = mondayOf(today);
    const trendKg = trend.at(-1)?.trendKg ?? p.weightKg;
    const fat = recentBodyFat(
      [...bodyFatValues(raw), ...sourced(raw, 'body_fat')].map((b) => ({
        day: b.day,
        value: b.value,
      })),
      today,
    );
    const basis = energyBasis({
      days,
      today,
      adaptive,
      everydayActivity: energy.everydayActivity,
      trainingDays: raw.activities.map((a) => a.date),
      // The intake floor uses the formula, never the watch's resting value.
      formulaBmrKcal: restingEnergy({ ...p, weightKg: trendKg }, today, fat).kcal,
    });
    const goal = raw.goals.at(-1) ?? null;
    const week = stored?.state.plan.weeks.find((w) => w.startDate === monday);
    const weekWorkouts =
      week && stored ? week.workouts.filter((w) => statusOf(stored.state, w.id) !== 'skipped') : [];
    // The week's planned training (fixed on Monday) and what was actually done so far.
    const plannedWeekKcal = [0, 1, 2, 3, 4, 5, 6].map((i) =>
      weekWorkouts
        .filter((w) => w.date === shift(monday, i))
        .reduce((sum, w) => sum + estimateWorkoutKcal(w, trendKg), 0),
    );
    const actualWeekKcalSoFar = days
      .filter((d) => d.day >= monday && d.day <= today)
      .reduce((sum, d) => sum + completedWorkoutKcal(d.active, d.restingKcal), 0);
    // The goal's rate is checked on the lowest planned week of the next four, so it holds in a
    // recovery week too.
    const weekDaily = (w: (typeof weekWorkouts)[number][]) =>
      w.reduce((sum, x) => sum + estimateWorkoutKcal(x, trendKg), 0) / 7;
    const comingWeeks = (stored?.state.plan.weeks ?? []).filter(
      (w) => w.startDate >= monday && w.startDate < shift(monday, 28),
    );
    const ratePlannedDailyKcal =
      stored && comingWeeks.length > 0
        ? Math.round(
            Math.min(
              ...comingWeeks.map((w) =>
                weekDaily(w.workouts.filter((x) => statusOf(stored.state, x.id) !== 'skipped')),
              ),
            ),
          )
        : undefined;
    const tags = week && stored ? weekTags(week, stored.input, stored.state.plan.targetDate) : [];
    const snapshotFor = (settings: Parameters<typeof goalSnapshot>[0]['goal']) =>
      goalSnapshot({
        goal: settings,
        basis: basis as EnergyBasis,
        sex: p.sex,
        trendKg,
        plannedWeekKcal,
        ...(ratePlannedDailyKcal !== undefined ? { ratePlannedDailyKcal } : {}),
        actualWeekKcalSoFar,
        weekdayIndex: daysBetween(monday, today),
        trend,
        days,
        today,
        proteinGPerKg: energy.proteinGPerKg,
        week: {
          ...weekLoadContext(stored?.state.plan.weeks ?? [], monday),
          raceWeek: tags.includes('race'),
          taper: tags.includes('taper'),
          keyDays: [...new Set(weekWorkouts.filter((w) => w.hard).map((w) => w.date))],
        },
      });
    const snapshot: GoalSnapshot | null = goal && !goal.paused && basis ? snapshotFor(goal) : null;
    // Without a goal (or paused) the target is maintenance – built the same stable way.
    const week0 =
      snapshot ??
      (basis
        ? snapshotFor({
            kind: 'maintain',
            targetWeightKg: null,
            ratePerWeekKg: 0,
            adjustmentKcal: 0,
          })
        : null);
    const target = week0
      ? { intakeKcal: week0.todayKcal, floorApplied: week0.targets.floorApplied }
      : maintenance;
    const todayEntries = raw.food.filter((f) => f.day === today);
    const eaten = sumNutrients(
      todayEntries.map((f) => ({
        kcal: f.kcal,
        proteinG: f.proteinG ?? 0,
        carbsG: f.carbsG ?? 0,
        fatG: f.fatG ?? 0,
      })),
    );
    const fatPoints = [...bodyFatValues(raw), ...sourced(raw, 'body_fat')]
      .map((b) => ({
        day: b.day,
        bodyFatPct: b.value,
        weightKg: trendOn(trend, b.day, 7)?.trendKg ?? null,
      }))
      .filter(
        (b): b is { day: string; bodyFatPct: number; weightKg: number } => b.weightKg !== null,
      )
      .sort((a, b) => a.day.localeCompare(b.day));
    const latestFat = fatPoints.at(-1);
    const proteinByDay = new Map<string, number>();
    for (const f of raw.food)
      if (f.proteinG !== null) proteinByDay.set(f.day, (proteinByDay.get(f.day) ?? 0) + f.proteinG);
    return {
      raw,
      days,
      incompleteDays: raw.incompleteDays,
      proteinByDay: [...proteinByDay.entries()].map(([day, proteinG]) => ({ day, proteinG })),
      bodyFatPoints: fatPoints.map((p) => ({ day: p.day, bodyFatPct: p.bodyFatPct })),
      today: todayDay,
      targetKcal: target.intakeKcal,
      remainingKcal: target.intakeKcal - (todayDay.intakeKcal ?? 0),
      floorApplied: target.floorApplied,
      correctionKcal,
      thisWeek: weekBalance(days.filter((d) => d.day >= monday)),
      lastWeek: weekBalance(days.filter((d) => d.day >= shift(monday, -7) && d.day < monday)),
      trend,
      adaptive,
      scale: calculationVsScale({ days, trend, today }),
      composition: bodyComposition({
        start: fatPoints[0] ?? null,
        current: latestFat && daysBetween(latestFat.day, today) <= 30 ? latestFat : null,
      }),
      tooFastLoss: rapidLossWarning(trend, today).warning,
      basis,
      goalPlannedDailyKcal: Math.min(
        Math.round(plannedWeekKcal.reduce((a, b) => a + b, 0) / 7),
        ratePlannedDailyKcal ?? Infinity,
      ),
      trendKg,
      goal,
      goalSnapshot: snapshot,
      addedBack: {
        kcal: week0
          ? week0.addedBackKcal
          : completedWorkoutKcal(todayDay.active, todayDay.restingKcal),
      },
      breakdown: week0?.breakdown ?? null,
      deviation: week0?.deviation ?? null,
      belowFloor:
        snapshot?.targets.status === 'belowFloor' && snapshot.targets.proposedRatePerWeekKg !== null
          ? {
              requested: snapshot.targets.requestedRatePerWeekKg,
              proposed: snapshot.targets.proposedRatePerWeekKg,
            }
          : null,
      energy,
      eaten,
      fuelling: fuellingHints(
        stored
          ? allWorkouts(stored.state.plan)
              .filter(
                (w) =>
                  (w.date === today || w.date === shift(today, 1)) &&
                  statusOf(stored.state, w.id) === 'planned',
              )
              .map((w) => ({ date: w.date, sport: w.sport, durationMin: w.durationMin }))
          : [],
      ),
      macros: macroTargets({
        kcal: target.intakeKcal,
        weightKg: trendKg,
        proteinGPerKg: energy.proteinGPerKg,
        fatGPerKg: energy.fatGPerKg,
      }),
    };
  }, [inputs.data, profile.data, plan.data, energySettings.data, from, today]);

  // Every new estimate and every target change is stored with its basis / reason (once a day).
  useEffect(() => {
    if (!model || !guard.canWrite) return;
    const { adaptive, raw } = model;
    if (adaptive.status === 'ok' && !raw.estimates.some((e) => e.date === adaptive.estimate.date)) {
      void repo.saveTdeeEstimate({ ...adaptive.estimate, basis: { ...adaptive.estimate.basis } });
    }
    // The goal's daily target (or maintenance) – stored whenever it moves, with its reason.
    const snap = model.goalSnapshot;
    const daily = snap ? snap.targets.dailyKcal : (model.basis?.tdeeKcal ?? null);
    if (daily !== null) {
      const reason =
        snap?.targets.reason === 'safety_clamp'
          ? 'safety_clamp'
          : model.basis?.source === 'adaptive'
            ? 'adaptive'
            : (model.goal?.reason ?? 'user');
      const change = nextTargetChange(
        raw.targets.at(-1) ?? null,
        { intakeKcal: daily, reason },
        todayIso(),
      );
      if (change && !raw.targets.some((x) => x.date === change.date)) {
        void repo.saveTargetChange(change);
      }
    }
  }, [model, guard.canWrite]);

  if (!model) return null;
  const { raw: _raw, ...rest } = model;
  return rest;
}
