import { metricsOfGroup, type HealthGroup, type HealthMetric } from '@peakr/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteHealthRecords,
  getEnabledGroups,
  saveHealthRows,
} from '@/data/repositories/health-repository';
import { health } from '@/features/health/health';
import { DEVICE_METRICS, DEVICE_READ_DAYS } from '@/features/health/device-map';

/**
 * The phone's health store (Health Connect / HealthKit) as a second source of the same metrics.
 * Values stay on this device (never uploaded) and are deduplicated against Garmin on read, where
 * Garmin wins (CLAUDE.md "Health"). Only metrics of groups the user switched on are read.
 */

export const deviceKeys = { state: ['health', 'device'] as const };

function wanted(groups: readonly HealthGroup[]): HealthMetric[] {
  const inGroups = new Set(groups.flatMap(metricsOfGroup));
  return DEVICE_METRICS.filter((m) => inGroups.has(m));
}

/** Reads the last 30 days of the enabled groups into the local table. Returns the rows stored. */
export async function readDeviceHealth(groups: readonly HealthGroup[]): Promise<number> {
  const metrics = wanted(groups);
  if (metrics.length === 0 || !(await health.isSupported())) return 0;
  const to = new Date();
  const from = new Date(to.getTime() - DEVICE_READ_DAYS * 86_400_000);
  const values = await health.readDaily(metrics, from, to);
  const readMetrics = await health.readableMetrics(metrics);
  // A permission withdrawn in the system settings: its old values go too.
  const withdrawn = metrics.filter((m) => !readMetrics.includes(m));
  if (withdrawn.length) await deleteHealthRecords({ source: health.store, metrics: withdrawn });
  await saveHealthRows(values.map((v) => ({ ...v, source: health.store })));
  return values.length;
}

export async function deviceProvides(): Promise<HealthMetric[]> {
  if (!(await health.isSupported())) return [];
  return health.readableMetrics(DEVICE_METRICS);
}

export interface DeviceHealthState {
  supported: boolean;
  store: typeof health.store;
  /** Metrics the user allowed Peakr to read. */
  provides: HealthMetric[];
  /** Enabled groups (offline copy of the server answer). */
  groups: HealthGroup[];
}

export function useDeviceHealth(): DeviceHealthState {
  const { data } = useQuery({
    queryKey: deviceKeys.state,
    queryFn: async (): Promise<DeviceHealthState> => ({
      supported: await health.isSupported(),
      store: health.store,
      provides: await deviceProvides(),
      groups: await getEnabledGroups(),
    }),
  });
  return data ?? { supported: false, store: health.store, provides: [], groups: [] };
}

/** Asks for read access to the enabled groups' metrics, then reads them once. */
export function useAllowDeviceHealth() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (groups: readonly HealthGroup[]) => {
      const allowed = await health.requestReadPermission(wanted(groups));
      if (allowed.length) await readDeviceHealth(groups);
      return allowed;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['health'] }),
  });
}
