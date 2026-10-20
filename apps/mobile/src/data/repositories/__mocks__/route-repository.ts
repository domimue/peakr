import type { LatLon, SourceRef } from '@peakr/engine';

import type { NewRoute, StoredRoute, StoredStream } from '../route-repository';

/** In-memory route repository for Jest (`jest.mock('@/data/repositories/route-repository')`). */

export type { NewRoute, StoredRoute, StoredStream, SyncRoute } from '../route-repository';

export const store = {
  routes: [] as StoredRoute[],
  streams: [] as StoredStream[],
  komoot: null as string | null,
  homeStart: null as LatLon | null,
};

export function resetStore(): void {
  store.routes = [];
  store.streams = [];
  store.komoot = null;
  store.homeStart = null;
}

const same = (a: SourceRef, b: SourceRef) => a.source === b.source && a.externalId === b.externalId;

export const listRoutes = jest.fn(async () =>
  [...store.routes].sort((a, b) => b.createdAt - a.createdAt),
);

export const getRoute = jest.fn(
  async (id: string) => store.routes.find((r) => r.id === id) ?? null,
);

export const saveRoute = jest.fn(async (route: NewRoute, now = Date.now()) => {
  const stored: StoredRoute = { ...route, createdAt: now, updatedAt: now };
  store.routes = [...store.routes.filter((r) => r.id !== route.id), stored];
  return stored;
});

export const renameRoute = jest.fn(async (id: string, name: string) => {
  store.routes = store.routes.map((r) => (r.id === id ? { ...r, name } : r));
});

export const deleteRoute = jest.fn(async (id: string) => {
  store.routes = store.routes.filter((r) => r.id !== id);
});

export const readDirtyRoutes = jest.fn(() => []);
export const markRoutesPushed = jest.fn();
export const applyRoutesFromServer = jest.fn(() => false);

export const getStreams = jest.fn(async (refs: readonly SourceRef[]) =>
  store.streams.filter((s) => refs.some((r) => same(r, s))),
);

export const listStreams = jest.fn(async () => store.streams);

export const applyStreams = jest.fn(
  (upserts: readonly StoredStream[], deletes: readonly SourceRef[]) => {
    store.streams = store.streams.filter(
      (s) => !deletes.some((d) => same(d, s)) && !upserts.some((u) => same(u, s)),
    );
    store.streams.push(...upserts);
  },
);

export const getKomootProfileUrl = jest.fn(async () => store.komoot);

export const saveKomootProfileUrl = jest.fn(async (url: string | null) => {
  store.komoot = url;
});

export const getHomeStart = jest.fn(async () => store.homeStart);

export const saveHomeStart = jest.fn(async (start: LatLon | null) => {
  store.homeStart = start;
});
