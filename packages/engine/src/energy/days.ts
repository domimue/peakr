import {
  activeEnergyDay,
  type ActiveEnergy,
  type CompletedWorkout,
  type PlannedWorkoutEnergy,
} from './active';
import type { EnergyDay } from './balance';
import { daysBetween, recentBodyFat, restingEnergy, type BodyProfile } from './energy';
import { pickBySource, type BodySource } from './sources';
import { trendOn, weightTrend, type TrendPoint, type WeighIn } from './trend';

/** One value of one day from one source. */
export interface SourcedValue {
  day: string;
  source: BodySource;
  value: number;
}

export interface EnergyInputs {
  /** Profile; its weight is used where no trend exists yet. */
  profile: BodyProfile;
  from: string;
  to: string;
  today: string;
  /** Logged intake per day: the diary as `manual`, a health store's nutrition as its source. */
  intake: readonly SourcedValue[];
  restingKcal: readonly SourcedValue[];
  /** Whole-day active energy of a wearable. */
  activeKcal: readonly SourcedValue[];
  workoutKcal: readonly SourcedValue[];
  steps: readonly SourcedValue[];
  weight: readonly SourcedValue[];
  bodyFat: readonly SourcedValue[];
  completed: readonly { day: string; workout: CompletedWorkout }[];
  planned: readonly { day: string; workout: PlannedWorkoutEnergy }[];
  incompleteDays: readonly string[];
  correction?: number;
}

export interface ModelDay extends EnergyDay {
  intakeSource: BodySource | null;
  restingSource: BodySource;
  active: ActiveEnergy;
}

const byDay = (values: readonly SourcedValue[], day: string) =>
  pickBySource(values.filter((v) => v.day === day));

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** One weigh-in per day, the best source winning (manual > watch > phone). */
export function weighInsOf(weights: readonly SourcedValue[]): WeighIn[] {
  const days = [...new Set(weights.map((w) => w.day))].sort();
  return days.map((date) => ({ date, weightKg: (byDay(weights, date) as SourcedValue).value }));
}

/**
 * The days of the energy model from every source, with the priority of CLAUDE.md "Energy & body
 * rules" (manual > device/Health data > estimate) applied per value and day. Uses the trend weight
 * of each day, never a single weigh-in.
 */
export function energyDays(input: EnergyInputs): { days: ModelDay[]; trend: TrendPoint[] } {
  const trend = weightTrend(weighInsOf(input.weight));
  const incomplete = new Set(input.incompleteDays);
  const days: ModelDay[] = [];
  for (let day = input.from; day <= input.to; day = addDays(day, 1)) {
    const weightKg = trendOn(trend, day, 60)?.trendKg ?? input.profile.weightKg;
    const profile = { ...input.profile, weightKg };
    const fat = recentBodyFat(
      input.bodyFat.filter((b) => b.day <= day).map((b) => ({ day: b.day, value: b.value })),
      day,
    );
    const device = byDay(input.restingKcal, day);
    const restingKcal = device ? Math.round(device.value) : restingEnergy(profile, day, fat).kcal;
    const active = activeEnergyDay({
      profile,
      day,
      today: input.today,
      restingKcal,
      wearableActiveKcal: byDay(input.activeKcal, day)?.value ?? null,
      deviceWorkoutKcal: byDay(input.workoutKcal, day)?.value ?? null,
      completed: input.completed.filter((c) => c.day === day).map((c) => c.workout),
      planned: input.planned.filter((p) => p.day === day).map((p) => p.workout),
      steps: byDay(input.steps, day)?.value ?? null,
      correction: input.correction,
    });
    const intake = byDay(input.intake, day);
    days.push({
      day,
      intakeKcal: intake ? Math.round(intake.value) : null,
      // Today is never complete before it is over.
      complete: intake !== null && !incomplete.has(day) && daysBetween(day, input.today) > 0,
      restingKcal,
      activeKcal: active.kcal,
      intakeSource: intake?.source ?? null,
      restingSource: device?.source ?? 'estimate',
      active,
    });
  }
  return { days, trend };
}
