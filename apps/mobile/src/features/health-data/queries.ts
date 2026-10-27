import { metricsOfGroup, type HealthGroup, type HealthMetric } from '@peakr/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/data/supabase';
import * as repo from '@/data/repositories/health-repository';
import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';

import {
  connectPersonalKey,
  deleteServerHealthData,
  disconnectPersonalKey,
  fetchHealthDiagnostics,
  fetchHealthStatus,
  requestHealthBackfill,
  requestHealthSync,
  saveConsents,
} from './api';
import { readDeviceHealth } from './read-device';
import { syncGarminHealth } from './sync';

/** TanStack Query hooks of the health data (Insights → Health). */

export const healthKeys = {
  all: ['health'] as const,
  status: (userId: string | null) => ['health', 'status', userId] as const,
  values: ['health', 'values'] as const,
  diagnostics: ['health', 'diagnostics'] as const,
};

export function useHealthStatus() {
  const userId = useSessionStore(selectAccountUserId);
  return useQuery({
    queryKey: healthKeys.status(userId),
    queryFn: fetchHealthStatus,
    enabled: userId !== null && supabase !== null,
    staleTime: 5 * 60_000,
  });
}

/** Deduplicated daily values from this device's copy (works offline). */
export function useHealthValues(metrics: readonly HealthMetric[], from?: string) {
  return useQuery({
    queryKey: [...healthKeys.values, [...metrics].sort().join(','), from ?? null],
    queryFn: () => repo.getDailyValues({ metrics, from }),
  });
}

/** Pulls Garmin (server copy, plus a fresh pull on the pull tier) and the phone's health store. */
export function useHealthSync() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ pull }: { pull: boolean }) => {
      if (pull) await requestHealthSync().catch(() => undefined);
      // Offline or the server unreachable: the phone's health store is still read.
      const status = await syncGarminHealth().catch(() => null);
      await readDeviceHealth(status?.groups ?? (await repo.getEnabledGroups()));
      return status;
    },
    onSettled: () => client.invalidateQueries({ queryKey: healthKeys.all }),
  });
}

/** "Fetch older data again": the server walks the history back from today once more. */
export function useHealthBackfill() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: requestHealthBackfill,
    onSettled: () => client.invalidateQueries({ queryKey: healthKeys.all }),
  });
}

/** Developer diagnostics: Garmin endpoints on the server, values per source on this device. */
export function useHealthDiagnostics() {
  return useQuery({
    queryKey: healthKeys.diagnostics,
    queryFn: async () => ({
      server: await fetchHealthDiagnostics().catch(() => null),
      local: await repo.getSourceCounts(),
    }),
  });
}

export function useSaveConsents() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (groups: Partial<Record<HealthGroup, boolean>>) => {
      const enabled = await saveConsents(groups);
      await repo.saveEnabledGroups(enabled);
      const off = (Object.keys(groups) as HealthGroup[]).filter((g) => groups[g] === false);
      // Switching a group off deletes its values, here and on the server.
      if (off.length) await repo.deleteHealthRecords({ metrics: off.flatMap(metricsOfGroup) });
      return enabled;
    },
    onSettled: () => client.invalidateQueries({ queryKey: healthKeys.all }),
  });
}

/** Deletes all health data (server and this device). The account and the connections stay. */
export function useDeleteHealthData() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!(await deleteServerHealthData())) throw new Error('delete failed');
      await repo.deleteHealthRecords();
    },
    onSettled: () => client.invalidateQueries({ queryKey: healthKeys.all }),
  });
}

export function useConnectPersonalKey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: connectPersonalKey,
    onSettled: () => client.invalidateQueries({ queryKey: healthKeys.all }),
  });
}

export function useDisconnectPersonalKey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!(await disconnectPersonalKey())) throw new Error('disconnect failed');
      await repo.deleteHealthRecords({ source: 'garmin' });
    },
    onSettled: () => client.invalidateQueries({ queryKey: healthKeys.all }),
  });
}
