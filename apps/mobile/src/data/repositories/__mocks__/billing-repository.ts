import type { Access } from '@/features/billing/model';

/** In-memory access cache for Jest (`jest.mock('@/data/repositories/billing-repository')`). */

export const store = { access: null as Access | null };

export const getCachedAccess = jest.fn(async () => store.access);
export const saveCachedAccess = jest.fn(async (access: Access) => {
  store.access = access;
});
