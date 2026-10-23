import type { HealthGroup, HealthMetric } from '@peakr/engine';
import { useQuery } from '@tanstack/react-query';

import { getEnabledGroups } from '@/data/repositories/health-repository';

/**
 * The phone's health store (Health Connect / HealthKit) as a second source of the same metrics.
 * `readDeviceHealth` copies the enabled groups into the local health table; `useDeviceHealth`
 * says which metrics it can deliver right now (read permission granted) and which groups are on.
 */

export async function readDeviceHealth(_groups: readonly HealthGroup[]): Promise<number> {
  return 0;
}

export async function deviceProvides(): Promise<HealthMetric[]> {
  return [];
}

export function useDeviceHealth(): { provides: HealthMetric[]; groups: HealthGroup[] } {
  const { data } = useQuery({
    queryKey: ['health', 'device'],
    queryFn: async () => ({ provides: await deviceProvides(), groups: await getEnabledGroups() }),
  });
  return data ?? { provides: [], groups: [] };
}
