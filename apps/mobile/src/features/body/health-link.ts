import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as repo from '@/data/repositories/body-repository';
import { useEntitlement } from '@/features/billing/billing-store';
import { health } from '@/features/health/health';
import { BODY_HEALTH_METRICS, type BodyHealthMetric } from '@/features/health/types';

import { assertCanWrite, bodyKeys } from './queries';

/**
 * Health Connect / HealthKit for the Body add-on: weight, body fat, steps, resting and active
 * energy, nutrition and workouts. Asked for only while the add-on is active (never during
 * onboarding or for Teil A), and only for these record types. Values stay on the device; a
 * permission withdrawn in the system settings removes that metric's values here too.
 */

/** Health Connect keeps 30 days readable without the extra history permission. */
const READ_DAYS = 30;

export const bodyHealthKey = ['body', 'health-link'] as const;

export interface BodyHealthState {
  supported: boolean;
  store: typeof health.store;
  allowed: BodyHealthMetric[];
}

/** Reads the last 30 days into the Body store. Returns the number of values. */
export async function readBodyHealth(now = new Date()): Promise<number> {
  const allowed = await health.bodyReadable();
  const withdrawn = BODY_HEALTH_METRICS.filter((m) => !allowed.includes(m));
  if (withdrawn.length) await repo.deleteDeviceValues(withdrawn);
  if (allowed.length === 0) return 0;
  const from = new Date(now.getTime() - READ_DAYS * 86_400_000);
  const values = await health.readBody(from, now);
  await repo.saveDeviceValues(values.map((v) => ({ ...v, source: health.store })));
  return values.length;
}

export function useBodyHealth() {
  const guard = useEntitlement('body_nutrition');
  return useQuery({
    queryKey: bodyHealthKey,
    enabled: guard.canWrite,
    queryFn: async (): Promise<BodyHealthState> => ({
      supported: await health.isSupported(),
      store: health.store,
      allowed: await health.bodyReadable(),
    }),
  });
}

/** The system permission sheet for the Body record types, then a first read. */
export function useConnectBodyHealth() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      assertCanWrite();
      const allowed = await health.requestBodyPermission();
      if (allowed.length) await readBodyHealth();
      return allowed;
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: bodyHealthKey });
      await client.invalidateQueries({ queryKey: bodyKeys.all });
    },
  });
}

/** Refreshes the values when Body opens (add-on active and something allowed). */
export function useRefreshBodyHealth() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      assertCanWrite();
      return readBodyHealth();
    },
    onSuccess: (n) => (n > 0 ? client.invalidateQueries({ queryKey: bodyKeys.all }) : undefined),
  });
}
