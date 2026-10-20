import type {
  ActivityStream,
  Climb,
  ElevationPoint,
  LatLon,
  RouteSport,
  SourceRef,
} from '@peakr/engine';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client';
import { activityStreams, appSettings, routes, type RouteSource } from '../db/schema';

/**
 * The user's route library (imported GPX files, routes recognised from Strava) and the recorded
 * streams of imported activities. Routes are synced to the server as backup; streams come from
 * the server only.
 */

export interface StoredRoute {
  id: string;
  name: string;
  sport: RouteSport;
  source: RouteSource;
  distanceM: number;
  gainM: number;
  lossM: number;
  start: { lat: number; lon: number };
  polyline: string;
  profile: ElevationPoint[];
  climbs: Climb[];
  sourceKeys: string[];
  createdAt: number;
  updatedAt: number;
}

export type NewRoute = Omit<StoredRoute, 'createdAt' | 'updatedAt'>;

export interface StoredStream extends SourceRef {
  data: ActivityStream;
  latlng: string | null;
}

/** A route as it travels to / from the server; `deleted` routes are tombstones. */
export interface SyncRoute extends StoredRoute {
  deleted: boolean;
}

type Row = typeof routes.$inferSelect;

function fromRow(row: Row): StoredRoute {
  return {
    id: row.id,
    name: row.name,
    sport: row.sport,
    source: row.source,
    distanceM: row.distanceM,
    gainM: row.gainM,
    lossM: row.lossM,
    start: { lat: row.startLat, lon: row.startLon },
    polyline: row.polyline,
    profile: row.profile,
    climbs: row.climbs,
    sourceKeys: row.sourceKeys,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRow(r: StoredRoute) {
  const { start, ...rest } = r;
  return { ...rest, startLat: start.lat, startLon: start.lon };
}

export async function listRoutes(): Promise<StoredRoute[]> {
  const rows = await db.select().from(routes).where(eq(routes.deleted, false));
  return rows.map(fromRow).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRoute(id: string): Promise<StoredRoute | null> {
  const [row] = await db.select().from(routes).where(eq(routes.id, id));
  return row && !row.deleted ? fromRow(row) : null;
}

export async function saveRoute(route: NewRoute, now = Date.now()): Promise<StoredRoute> {
  const stored: StoredRoute = { ...route, createdAt: now, updatedAt: now };
  await db
    .insert(routes)
    .values({ ...toRow(stored), dirty: true, deleted: false })
    .onConflictDoUpdate({
      target: routes.id,
      set: { ...toRow({ ...stored, createdAt: now }), dirty: true, deleted: false },
    });
  return stored;
}

export async function renameRoute(id: string, name: string, now = Date.now()): Promise<void> {
  await db.update(routes).set({ name, updatedAt: now, dirty: true }).where(eq(routes.id, id));
}

/** Marks the route deleted; it disappears for good once the deletion is pushed. */
export async function deleteRoute(id: string, now = Date.now()): Promise<void> {
  await db
    .update(routes)
    .set({ deleted: true, updatedAt: now, dirty: true })
    .where(eq(routes.id, id));
}

// ---------------------------------------------------------------------------------------------
// Sync

export function readDirtyRoutes(): SyncRoute[] {
  return db
    .select()
    .from(routes)
    .where(eq(routes.dirty, true))
    .all()
    .map((row) => ({ ...fromRow(row), deleted: row.deleted }));
}

/** After a push: clean rows that were not edited again meanwhile; drop pushed deletions. */
export function markRoutesPushed(pushed: readonly SyncRoute[]): void {
  db.transaction((tx) => {
    for (const r of pushed) {
      const where = and(eq(routes.id, r.id), eq(routes.updatedAt, r.updatedAt));
      if (r.deleted) tx.delete(routes).where(where).run();
      else tx.update(routes).set({ dirty: false }).where(where).run();
    }
  });
}

/** Server changes, last write wins per route; local unpushed edits that are newer stay. */
export function applyRoutesFromServer(incoming: readonly SyncRoute[]): boolean {
  let changed = false;
  db.transaction((tx) => {
    for (const r of incoming) {
      const [local] = tx.select().from(routes).where(eq(routes.id, r.id)).all();
      if (local && local.updatedAt >= r.updatedAt) continue;
      changed = true;
      if (r.deleted) {
        tx.delete(routes).where(eq(routes.id, r.id)).run();
        continue;
      }
      const values = { ...toRow(r), dirty: false, deleted: false };
      tx.insert(routes).values(values).onConflictDoUpdate({ target: routes.id, set: values }).run();
    }
  });
  return changed;
}

// ---------------------------------------------------------------------------------------------
// Activity streams

export async function getStreams(refs: readonly SourceRef[]): Promise<StoredStream[]> {
  if (refs.length === 0) return [];
  const ids = refs.map((r) => r.externalId);
  const rows = await db
    .select()
    .from(activityStreams)
    .where(inArray(activityStreams.externalId, ids));
  return rows.filter((row) =>
    refs.some((r) => r.source === row.source && r.externalId === row.externalId),
  );
}

export async function listStreams(): Promise<StoredStream[]> {
  return db.select().from(activityStreams);
}

export function applyStreams(upserts: readonly StoredStream[], deletes: readonly SourceRef[]) {
  db.transaction((tx) => {
    for (const s of upserts) {
      tx.insert(activityStreams)
        .values(s)
        .onConflictDoUpdate({
          target: [activityStreams.source, activityStreams.externalId],
          set: { data: s.data, latlng: s.latlng },
        })
        .run();
    }
    for (const d of deletes) {
      tx.delete(activityStreams)
        .where(
          and(eq(activityStreams.source, d.source), eq(activityStreams.externalId, d.externalId)),
        )
        .run();
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Komoot profile URL (Phase 1 of the Komoot integration: stored only, never fetched)

const KOMOOT_KEY = 'komoot.profileUrl';

export async function getKomootProfileUrl(): Promise<string | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KOMOOT_KEY) });
  return row?.value ?? null;
}

export async function saveKomootProfileUrl(url: string | null): Promise<void> {
  if (url === null) {
    await db.delete(appSettings).where(eq(appSettings.key, KOMOOT_KEY));
    return;
  }
  await db
    .insert(appSettings)
    .values({ key: KOMOOT_KEY, value: url })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: url } });
}

// ---------------------------------------------------------------------------------------------
// Home start point (route matching prefers routes that start near it; stored on the device only)

const HOME_START_KEY = 'routes.homeStart';

export async function getHomeStart(): Promise<LatLon | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, HOME_START_KEY) });
  if (!row) return null;
  try {
    const p = JSON.parse(row.value) as Partial<LatLon>;
    return typeof p.lat === 'number' && typeof p.lon === 'number'
      ? { lat: p.lat, lon: p.lon }
      : null;
  } catch {
    return null;
  }
}

export async function saveHomeStart(start: LatLon | null): Promise<void> {
  if (start === null) {
    await db.delete(appSettings).where(eq(appSettings.key, HOME_START_KEY));
    return;
  }
  const value = JSON.stringify({ lat: start.lat, lon: start.lon });
  await db
    .insert(appSettings)
    .values({ key: HOME_START_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
