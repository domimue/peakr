import {
  liveReducer,
  restoreLive,
  serializeLive,
  type LiveAction,
  type LiveSession,
} from '@peakr/engine';
import { create } from 'zustand';

import * as repo from '@/data/repositories/gym-repository';

import { cancelRestNotification, syncRestNotification } from './rest-notifications';

/**
 * The running gym session (CLAUDE.md "Gym": live session). Every change goes through the engine's
 * reducer and is written to SQLite right away, so the session survives the app being killed and
 * works offline. `hydrate` restores it on start; the elapsed time is derived from `startedAt`.
 */

interface LiveSessionState {
  live: LiveSession | null;
  /** Restored from storage (or nothing was there). */
  hydrated: boolean;
  /** Left open for more than a day: offer to finish or discard. */
  stale: boolean;
  hydrate: () => Promise<void>;
  start: (session: LiveSession) => void;
  dispatch: (action: LiveAction) => void;
  /** Throws the running session away (nothing is saved). */
  discard: () => void;
  /** After the session was stored by `finishLiveSession`. */
  finished: () => void;
}

/** Name of the exercise whose rest is running – set by the live screen for the notification. */
let restLabel: (entryId: string) => string = () => '';
export function setRestLabel(fn: (entryId: string) => string): void {
  restLabel = fn;
}

function persist(live: LiveSession): void {
  try {
    repo.saveLiveSession(serializeLive(live));
  } catch (error) {
    console.warn('Running gym session not saved', error);
  }
}

export const useLiveSessionStore = create<LiveSessionState>()((set, get) => ({
  live: null,
  hydrated: false,
  stale: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const restored = restoreLive(await repo.getLiveSession(), Date.now());
      // A session started meanwhile (before the restore finished) wins.
      if (!get().live) {
        set({ live: restored?.session ?? null, stale: restored?.stale ?? false });
      }
    } catch (error) {
      console.warn('Running gym session not restored', error);
    }
    set({ hydrated: true });
  },
  start: (live) => {
    persist(live);
    set({ live, stale: false, hydrated: true });
  },
  dispatch: (action) => {
    const current = get().live;
    if (!current) return;
    const next = liveReducer(current, action, Date.now());
    if (next === current) return;
    persist(next);
    set({ live: next });
    if (next.rest !== current.rest) {
      const name = next.rest ? restLabel(next.rest.entryId) : '';
      void syncRestNotification(next.rest, name);
    }
  },
  discard: () => {
    repo.clearLiveSession();
    void cancelRestNotification();
    set({ live: null, stale: false });
  },
  finished: () => {
    void cancelRestNotification();
    set({ live: null, stale: false });
  },
}));
