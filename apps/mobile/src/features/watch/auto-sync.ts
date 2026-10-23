import { allWorkouts, type ElevationPoint } from '@peakr/engine';
import { AUTO_SYNC_DAYS, plannedWatchWorkouts, type PushResult } from '@peakr/watch';
import { useEffect } from 'react';

import { todayIso } from '@/data/ids';
import { getRoute } from '@/data/repositories/route-repository';
import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { useIntegrations } from '@/features/integrations/queries';
import { usePlan } from '@/features/plan/queries';
import { planHrZones } from '@/features/training-zones/resolve';
import type { StoredPlan } from '@/data/repositories/plan-repository';

import { directEnabled, isDirect, type DirectWatch } from './options';
import { useWatchChoice } from './queries';
import { createRemoteWatchProvider } from './remote-provider';

/**
 * Keeps a connected watch platform in step with the plan: the next two weeks of workouts go to
 * Garmin / COROS / Suunto and follow every change (a moved workout moves on the watch, a skipped
 * one disappears). Runs a few seconds after the plan last changed, only when the user picked that
 * watch, the platform's direct sync is switched on and the account is connected.
 */

const DEBOUNCE_MS = 5000;

export async function syncPlanToWatch(watch: DirectWatch, stored: StoredPlan): Promise<PushResult> {
  const today = todayIso();
  const routeProfiles: Record<string, ElevationPoint[]> = {};
  const ids = new Set(
    allWorkouts(stored.state.plan).flatMap((w) =>
      w.routeId && w.date >= today ? [w.routeId] : [],
    ),
  );
  for (const id of ids) {
    const route = await getRoute(id);
    if (route) routeProfiles[id] = route.profile;
  }
  const workouts = plannedWatchWorkouts(
    {
      state: stored.state,
      profile: stored.input.profile,
      hrZones: planHrZones(stored.input),
      routeProfiles,
    },
    today,
    AUTO_SYNC_DAYS,
  );
  return createRemoteWatchProvider(watch).pushWorkouts(workouts);
}

export function useWatchAutoSync(): void {
  const { data: choice } = useWatchChoice();
  const { data: stored } = usePlan();
  const userId = useSessionStore(selectAccountUserId);
  const { data: integrations } = useIntegrations(userId);

  const watch = choice && isDirect(choice) && directEnabled(choice) ? choice : null;
  const connected =
    watch !== null && (integrations?.some((i) => i.provider === watch && i.status === 'active') ?? false);

  useEffect(() => {
    if (!watch || !connected || !stored) return;
    const timer = setTimeout(() => {
      void syncPlanToWatch(watch, stored).catch((e) => console.warn('Watch sync failed', String(e)));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [watch, connected, stored]);
}
