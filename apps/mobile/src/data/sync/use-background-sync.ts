import { useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { processNewActivities } from '../activities/process';
import { supabase } from '../supabase';
import { onLocalChange } from './changes';
import { syncOnce } from './sync';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncState {
  status: SyncStatus;
  /** Epoch ms of the last successful sync. */
  lastSyncedAt: number | null;
  error: string | null;
}

export const useSyncStore = create<SyncState>()(() => ({
  status: 'idle',
  lastSyncedAt: null,
  error: null,
}));

/** Push shortly after a local edit, so a burst of edits becomes one sync. */
const LOCAL_CHANGE_DELAY_MS = 3_000;
/** Pull regularly while the app is open, for edits made on another device. */
const INTERVAL_MS = 5 * 60_000;

let running: Promise<boolean> | null = null;
let again = false;

/**
 * Runs one sync now (single flight: a request during a running sync queues one more run).
 * Resolves to whether local data changed. Does nothing without a signed-in user or network.
 */
export async function requestSync(userId: string): Promise<boolean> {
  if (!supabase) return false;
  if (running) {
    again = true;
    return running;
  }
  const client = supabase;
  running = (async () => {
    let changed = false;
    do {
      again = false;
      const network = await Network.getNetworkStateAsync();
      if (network.isInternetReachable === false || network.isConnected === false) {
        useSyncStore.setState({ status: 'offline' });
        break;
      }
      useSyncStore.setState({ status: 'syncing' });
      try {
        const result = await syncOnce(client, userId);
        changed ||= result.changed;
        // New activities (or a plan that waited for them): mark planned workouts done /
        // rebalance the week, then announce them.
        const notices = await processNewActivities();
        changed ||= notices.length > 0;
        useSyncStore.setState({ status: 'idle', lastSyncedAt: Date.now(), error: null });
      } catch (error) {
        console.warn('Sync failed', error);
        useSyncStore.setState({ status: 'error', error: String(error) });
        break;
      }
    } while (again);
    return changed;
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Background sync while a user is signed in: on sign-in, when the app comes to the foreground,
 * when the network comes back, shortly after local edits and every few minutes.
 */
export function useBackgroundSync(userId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !supabase) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = () => {
      void requestSync(userId).then((changed) => {
        // Server changes reached SQLite: let the screens read them again.
        if (changed) void queryClient.invalidateQueries();
      });
    };
    const runSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(run, LOCAL_CHANGE_DELAY_MS);
    };

    run();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') run();
    }, INTERVAL_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    const network = Network.addNetworkStateListener((state) => {
      if (state.isInternetReachable) run();
    });
    const local = onLocalChange(runSoon);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      appState.remove();
      network.remove();
      local();
    };
  }, [userId, queryClient]);
}
