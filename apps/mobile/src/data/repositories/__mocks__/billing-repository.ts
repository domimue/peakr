import type { Access, CachedAddon } from '@/features/billing/model';

/** In-memory access cache for Jest (`jest.mock('@/data/repositories/billing-repository')`). */

export const store = {
  access: null as Access | null,
  addon: null as CachedAddon | null,
  bodyTrialUsed: null as boolean | null,
};

export const getCachedAccess = jest.fn(async () => store.access);
export const saveCachedAccess = jest.fn(async (access: Access) => {
  store.access = access;
});
export const getCachedAddon = jest.fn(async () => store.addon);
export const saveCachedAddon = jest.fn(async (addon: CachedAddon) => {
  store.addon = addon;
});
export const bodyTrialUsed = jest.fn(async () => store.bodyTrialUsed);
