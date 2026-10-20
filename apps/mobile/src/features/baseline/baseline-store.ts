import type { BaselineOverrides } from '@peakr/engine';
import { create } from 'zustand';

import {
  getBaselineActivities,
  getBaselineMeta,
  saveBaselineOverrides,
  setBaselineSelected,
  type BaselineMeta,
  type StoredBaselineActivity,
} from '@/data/repositories/baseline-repository';

import { importBaseline, type ImportResult } from './api';

interface BaselineState {
  activities: StoredBaselineActivity[];
  meta: BaselineMeta | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Fetches the last 60 days from Strava and preselects them. */
  load: () => Promise<ImportResult>;
  toggle: (externalId: string) => void;
  selectAll: (selected: boolean) => void;
  /** Sets (or with `undefined` removes) one of the user's own values. */
  setOverride: <K extends keyof BaselineOverrides>(key: K, value: BaselineOverrides[K]) => void;
}

/** The baseline being reviewed: list, selection and the user's own values, saved on change. */
export const useBaselineStore = create<BaselineState>()((set, get) => ({
  activities: [],
  meta: null,
  hydrated: false,
  hydrate: async () => {
    const [activities, meta] = await Promise.all([getBaselineActivities(), getBaselineMeta()]);
    set({ activities, meta, hydrated: true });
  },
  load: async () => {
    const result = await importBaseline();
    if (result.ok) await get().hydrate();
    return result;
  },
  toggle: (externalId) => {
    const current = get().activities.find((a) => a.externalId === externalId);
    if (!current) return;
    const selected = !current.selected;
    set({
      activities: get().activities.map((a) =>
        a.externalId === externalId ? { ...a, selected } : a,
      ),
    });
    void setBaselineSelected([externalId], selected);
  },
  selectAll: (selected) => {
    const ids = get().activities.map((a) => a.externalId);
    set({ activities: get().activities.map((a) => ({ ...a, selected })) });
    void setBaselineSelected(ids, selected);
  },
  setOverride: (key, value) => {
    const meta = get().meta;
    if (!meta) return;
    const overrides = { ...meta.overrides };
    if (value === undefined) delete overrides[key];
    else overrides[key] = value;
    set({ meta: { ...meta, overrides } });
    void saveBaselineOverrides(overrides);
  },
}));
