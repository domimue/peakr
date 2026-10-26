import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as repo from '@/data/repositories/body-repository';
import { addonGuardNow, useEntitlement } from '@/features/billing/billing-store';

import { removeEntryFromHealth, syncEntryToHealth } from './food/health-nutrition';
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

export const useAddFood = () =>
  useWrite(async (draft: repo.FoodDraft) => {
    const entry = await repo.addFood(draft);
    await syncEntryToHealth(entry);
    return entry;
  });
export const useDeleteFood = () =>
  useWrite(async (id: string) => {
    await repo.deleteFood(id);
    await removeEntryFromHealth(id);
  });
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

export function useMeasurements() {
  const guard = useEntitlement('body_nutrition');
  return useQuery({
    queryKey: [...bodyKeys.all, 'measurements'],
    queryFn: repo.listMeasurements,
    enabled: guard.canRead,
  });
}

export const useSaveMeasurement = () => useWrite(repo.saveMeasurement);
export const useDeleteMeasurement = () => useWrite(repo.deleteMeasurement);
export const useUpdateCheckIn = () =>
  useWrite((v: { id: string; patch: Parameters<typeof repo.updateCheckIn>[1] }) =>
    repo.updateCheckIn(v.id, v.patch),
  );

/** Daily kcal quick entries (for people who do not log food). */
export function useDayKcal() {
  const guard = useEntitlement('body_nutrition');
  return useQuery({
    queryKey: [...bodyKeys.all, 'dayKcal'],
    queryFn: repo.listDayKcal,
    enabled: guard.canRead,
  });
}

export const useSetDayKcal = () => useWrite(repo.setDayKcal);

const checkInSettingsKey = ['body', 'checkInSettings'] as const;

/** The check-in rhythm (a device setting, so it is readable without the add-on). */
export function useCheckInSettings() {
  return useQuery({ queryKey: checkInSettingsKey, queryFn: repo.getCheckInSettings });
}

export function useSaveCheckInSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: repo.saveCheckInSettings,
    onSuccess: () => client.invalidateQueries({ queryKey: checkInSettingsKey }),
  });
}

/** Saves the whole check-in form: the day's weigh-in (added or corrected) and the check-in. */
export const useSaveCheckInForm = () =>
  useWrite(
    async (v: {
      weighIn: { id: string | null; day: string; weightKg: number } | null;
      checkIn: repo.MeasurementDraft | null;
    }) => {
      if (v.weighIn?.id) await repo.updateCheckIn(v.weighIn.id, v.weighIn);
      else if (v.weighIn)
        await repo.addCheckIn({
          day: v.weighIn.day,
          weightKg: v.weighIn.weightKg,
          waistCm: null,
          bodyFatPct: null,
          note: null,
        });
      if (v.checkIn) await repo.saveMeasurement(v.checkIn);
    },
  );
