import {
  adaptiveTdee,
  allWorkouts,
  bodyComposition,
  calculationVsScale,
  energyDays,
  intakeTarget,
  nextTargetChange,
  statusOf,
  rapidLossWarning,
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

import { useBodyProfile } from './profile';
import { bodyKeys } from './queries';

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
}

async function loadInputs(from: string): Promise<RawInputs> {
  const [food, checkIns, device, health, activities, incompleteDays, estimates, targets] =
    await Promise.all([
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
  };
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
      activeKcal: sourced(raw, 'active_kcal'),
      workoutKcal: sourced(raw, 'workout_kcal'),
      steps: sourced(raw, 'steps'),
      weight: [
        ...raw.checkIns.map((c) => ({ day: c.day, source: 'manual' as const, value: c.weightKg })),
        ...sourced(raw, 'weight'),
      ],
      bodyFat: [
        ...raw.checkIns
          .filter((c) => c.bodyFatPct !== null)
          .map((c) => ({ day: c.day, source: 'manual' as const, value: c.bodyFatPct as number })),
        ...sourced(raw, 'body_fat'),
      ],
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
    const target = intakeTarget({
      tdeeKcal: todayDay.restingKcal + todayDay.activeKcal + correctionKcal,
      bmrKcal: todayDay.restingKcal,
      sex: p.sex,
      kind: 'maintain',
    });
    const monday = mondayOf(today);
    const fatPoints = [
      ...raw.checkIns
        .filter((c) => c.bodyFatPct !== null)
        .map((c) => ({ day: c.day, value: c.bodyFatPct as number })),
      ...sourced(raw, 'body_fat'),
    ]
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
    return {
      raw,
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
    };
  }, [inputs.data, profile.data, plan.data, from, today]);

  // Every new estimate and every target change is stored with its basis / reason (once a day).
  useEffect(() => {
    if (!model || !guard.canWrite) return;
    const { adaptive, raw } = model;
    if (adaptive.status === 'ok' && !raw.estimates.some((e) => e.date === adaptive.estimate.date)) {
      void repo.saveTdeeEstimate({ ...adaptive.estimate, basis: { ...adaptive.estimate.basis } });
    }
    const base = adaptive.status === 'ok' ? adaptive.estimate.tdeeKcal : null;
    if (base !== null) {
      const t = intakeTarget({
        tdeeKcal: base,
        bmrKcal: model.today.restingKcal,
        sex: profile.data?.profile?.sex ?? 'female',
        kind: 'maintain',
        reason: 'adaptive',
      });
      const change = nextTargetChange(raw.targets.at(-1) ?? null, t, todayIso());
      if (change && !raw.targets.some((x) => x.date === change.date))
        void repo.saveTargetChange(change);
    }
  }, [model, guard.canWrite, profile.data]);

  if (!model) return null;
  const { raw: _raw, ...rest } = model;
  return rest;
}
