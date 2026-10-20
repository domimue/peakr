import type { BaselineOverrides } from '@peakr/engine';

import type { BaselineMeta, StoredBaselineActivity } from '../baseline-repository';

/** In-memory baseline for Jest (`jest.mock('@/data/repositories/baseline-repository')`). */

export type { BaselineMeta, StoredBaselineActivity } from '../baseline-repository';

export const BASELINE_KEY = 'baseline';

export const store = {
  activities: [] as StoredBaselineActivity[],
  meta: null as BaselineMeta | null,
  reconnectHint: false,
};

export function resetStore(): void {
  store.activities = [];
  store.meta = null;
  store.reconnectHint = false;
}

export const setReconnectHint = jest.fn(async () => {
  store.activities = [];
  store.meta = null;
  store.reconnectHint = true;
});
export const hasReconnectHint = jest.fn(async () => store.reconnectHint);
export const clearReconnectHint = jest.fn(async () => {
  store.reconnectHint = false;
});

export const getBaselineActivities = jest.fn(async () =>
  [...store.activities].sort((a, b) => b.date.localeCompare(a.date)),
);
export const replaceBaseline = jest.fn(
  async (rows: readonly StoredBaselineActivity[], meta: BaselineMeta) => {
    store.activities = rows.map((r) => ({ ...r }));
    store.meta = meta;
  },
);
export const setBaselineSelected = jest.fn(
  async (externalIds: readonly string[], selected: boolean) => {
    const ids = new Set(externalIds);
    store.activities = store.activities.map((a) =>
      ids.has(a.externalId) ? { ...a, selected } : a,
    );
  },
);
export const getBaselineMeta = jest.fn(async () => store.meta);
export const saveBaselineOverrides = jest.fn(async (overrides: BaselineOverrides) => {
  if (store.meta) store.meta = { ...store.meta, overrides };
});
export const clearBaseline = jest.fn(async () => {
  store.activities = [];
  store.meta = null;
});
