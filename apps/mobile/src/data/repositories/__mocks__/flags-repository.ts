import type { RemoteFlags } from '@/config/remote-flags';

/** In-memory remote flags for Jest (`jest.mock('@/data/repositories/flags-repository')`). */

export const store = {
  server: null as Partial<RemoteFlags> | null,
  cached: {} as Partial<RemoteFlags>,
};

export const fetchFlags = jest.fn(async () => store.server);
export const getCachedFlags = jest.fn(async () => store.cached);
export const saveCachedFlags = jest.fn(async (flags: Partial<RemoteFlags>) => {
  store.cached = flags;
});
