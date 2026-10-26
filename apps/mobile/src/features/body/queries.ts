import {
  allWorkouts,
  energyToday,
  estimateWorkoutKcal,
  statusOf,
  weightTrend,
} from '@peakr/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { todayIso } from '@/data/ids';
import { addonGuardNow, useEntitlement } from '@/features/billing/billing-store';
import { usePlan } from '@/features/plan/queries';

import { bodyProfileKey, useBodyProfile } from './profile';

/**
 * Body add-on data. Every read of real data and every write goes through the guard
 * (`useEntitlement('body_nutrition')` / `addonGuardNow`): reads need `canRead` (active, trial,
 * cancelled or expired – history stays), writes need `canWrite`. The server repeats the write
 * check (RLS), so a patched client gains nothing.
 */

/** Loaded on first use, so screens that only show the card never open the database for it. */
const repo = () => import('@/data/repositories/body-repository');

export class AddonLockedError extends Error {
  constructor() {
    super('body_nutrition locked');
    this.name = 'AddonLockedError';
  }
}

/** Throws unless new add-on entries are allowed right now. */
export function assertCanWrite(): void {
  if (!addonGuardNow('body_nutrition').canWrite) throw new AddonLockedError();
}

export const bodyKeys = {
  all: ['body'] as const,
  food: (day: string) => ['body', 'food', day] as const,
  checkIns: ['body', 'checkIns'] as const,
};

export function useFoodDay(day: string) {
  const guard = useEntitlement('body_nutrition');
  return useQuery({
    queryKey: bodyKeys.food(day),
    queryFn: async () => (await repo()).listFood(day),
    enabled: guard.canRead,
  });
}

export function useCheckIns() {
  const guard = useEntitlement('body_nutrition');
  return useQuery({
    queryKey: bodyKeys.checkIns,
    queryFn: async () => (await repo()).listCheckIns(),
    enabled: guard.canRead,
  });
}

function useWrite<T, R>(fn: (input: T) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      assertCanWrite();
      return fn(input);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: bodyKeys.all });
      await client.invalidateQueries({ queryKey: bodyProfileKey });
    },
  });
}

type Repo = typeof import('@/data/repositories/body-repository');

export const useAddFood = () =>
  useWrite(async (d: Parameters<Repo['addFood']>[0]) => (await repo()).addFood(d));
export const useDeleteFood = () => useWrite(async (id: string) => (await repo()).deleteFood(id));
export const useAddCheckIn = () =>
  useWrite(async (d: Parameters<Repo['addCheckIn']>[0]) => (await repo()).addCheckIn(d));
export const useDeleteCheckIn = () =>
  useWrite(async (id: string) => (await repo()).deleteCheckIn(id));

/**
 * "Energy today": the engine's numbers for today, or null when the add-on may not show real data
 * or the profile is incomplete. Workout energy comes from today's planned sessions that were not
 * skipped (estimated; device values join with the Health integration of the add-on).
 */
export function useEnergyToday() {
  const guard = useEntitlement('body_nutrition');
  const today = todayIso();
  const profile = useBodyProfile();
  const food = useFoodDay(today);
  const plan = usePlan();
  if (!guard.canRead || !profile.data?.profile || !food.data) return null;
  const stored = plan.data;
  const p = profile.data.profile;
  const workouts = stored
    ? allWorkouts(stored.state.plan)
        .filter((w) => w.date === today && statusOf(stored.state, w.id) !== 'skipped')
        .map((w) => ({ kcal: estimateWorkoutKcal(w, p.weightKg), source: 'estimate' as const }))
    : [];
  return energyToday({
    profile: p,
    today,
    workouts,
    intakeKcal: food.data.reduce((sum, f) => sum + f.kcal, 0),
  });
}

/** Weigh-ins with the smoothed trend for the Progress section. */
export function useWeightTrend() {
  const checkIns = useCheckIns();
  return checkIns.data
    ? weightTrend(checkIns.data.map((c) => ({ date: c.day, weightKg: c.weightKg })))
    : null;
}
