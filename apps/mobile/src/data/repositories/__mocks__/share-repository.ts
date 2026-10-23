import {
  DEFAULT_SHARE_SETTINGS,
  type ShareSettings,
  type ShareState,
  type ShareTarget,
} from '@peakr/engine';

import type { SessionShares } from '../share-repository';

/** In-memory share settings and states for Jest (`jest.mock('@/data/repositories/share-repository')`). */

export const store = {
  settings: DEFAULT_SHARE_SETTINGS as ShareSettings,
  states: {} as Record<string, SessionShares>,
};

export function resetStore(): void {
  store.settings = DEFAULT_SHARE_SETTINGS;
  store.states = {};
}

export const getShareSettings = jest.fn(async () => store.settings);
export const saveShareSettings = jest.fn(async (settings: ShareSettings) => {
  store.settings = settings;
});
export const getShareStates = jest.fn(async (sessionId: string) => store.states[sessionId] ?? {});
export const saveShareState = jest.fn(
  async (sessionId: string, target: ShareTarget, state: ShareState) => {
    store.states[sessionId] = { ...store.states[sessionId], [target]: state };
  },
);
