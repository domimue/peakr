import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as repo from '@/data/repositories/body-repository';
import { addonGuardNow, useEntitlement } from '@/features/billing/billing-store';

import { bodyProfileKey } from './profile';

/**
 * Body add-on data. Every read of real data and every write goes through the guard
 * (`useEntitlement('body_nutrition')` / `addonGuardNow`): reads need `canRead` (active, trial,
 * cancelled or expired – history stays), writes need `canWrite`. The server repeats the write
 * check (RLS), so a patched client gains nothing.
 */

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
    queryFn: () => repo.listFood(day),
    enabled: guard.canRead,
  });
}

export function useCheckIns() {
  const guard = useEntitlement('body_nutrition');
  return useQuery({
    queryKey: bodyKeys.checkIns,
    queryFn: repo.listCheckIns,
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

export const useAddFood = () => useWrite(repo.addFood);
export const useDeleteFood = () => useWrite(repo.deleteFood);
export const useAddCheckIn = () => useWrite(repo.addCheckIn);
export const useDeleteCheckIn = () => useWrite(repo.deleteCheckIn);

/** Marks a day incomplete (left out of the adaptive TDEE and "calculation vs. scale"). */
export const useSetDayIncomplete = () =>
  useWrite((v: { day: string; incomplete: boolean }) => repo.setDayIncomplete(v.day, v.incomplete));

export function useIncompleteDays() {
  const guard = useEntitlement('body_nutrition');
  return useQuery({
    queryKey: [...bodyKeys.all, 'incomplete'],
    queryFn: repo.listIncompleteDays,
    enabled: guard.canRead,
  });
}

/** Stores a new goal version (set, change, pause, accepted suggestion) with its reason. */
export const useSaveGoal = () => useWrite(repo.saveGoal);
