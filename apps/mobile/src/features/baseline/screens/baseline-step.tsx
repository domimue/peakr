import { router } from 'expo-router';
import { useState } from 'react';

import { clearReconnectHint } from '@/data/repositories/baseline-repository';
import { useSessionStore } from '@/features/auth/session-store';
import { connect } from '@/features/integrations/api';

import { useBaselineStore } from '../baseline-store';
import { usePendingConnect, type BaselineFlow } from '../pending-connect';

export type { BaselineFlow };

const ROUTES = {
  onboarding: { select: '/onboarding/baseline', summary: '/onboarding/baseline-summary' },
  recalibrate: { select: '/training/baseline', summary: '/training/baseline-summary' },
} as const;

export function baselineRoutes(flow: BaselineFlow) {
  return ROUTES[flow];
}

/**
 * After Strava is connected: imports the last 60 days and opens the list. Returns an error message
 * key, or null when the list opened. `replace` is for the deep-link screen, which must not stay in
 * the stack.
 */
export async function importAndOpen(
  flow: BaselineFlow,
  navigate: 'push' | 'replace' = 'push',
): Promise<string | null> {
  const result = await useBaselineStore.getState().load();
  if (!result.ok) return `baseline.errors.${result.reason}`;
  await clearReconnectHint();
  router[navigate](ROUTES[flow].select);
  return null;
}

/** Connects Strava if needed, imports the last 60 days and opens the list. */
export function useBaselineImport(flow: BaselineFlow) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      // The quiz runs before the account exists: Strava needs a (possibly anonymous) user.
      await useSessionStore.getState().ensureSession();
      const result = await useBaselineStore.getState().load();
      if (result.ok) {
        await clearReconnectHint();
        router.push(ROUTES[flow].select);
        return;
      }
      if (result.reason !== 'not_connected' && result.reason !== 'reconnect') {
        setError(`baseline.errors.${result.reason}`);
        return;
      }
      // If the Strava app takes over the consent (Android), the result comes back as a deep link;
      // the pending flow sends the user on to the list from there.
      usePendingConnect.getState().set(flow);
      const connected = await connect('strava', flow === 'onboarding' ? 'baseline' : undefined);
      if (connected === 'cancelled') return;
      usePendingConnect.getState().set(null);
      if (connected !== 'connected') {
        setError(`baseline.errors.${connected}`);
        return;
      }
      setError(await importAndOpen(flow));
    } catch {
      setError('baseline.errors.error');
    } finally {
      setBusy(false);
    }
  };

  return { start, busy, error };
}
