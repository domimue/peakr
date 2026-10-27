import type { SupabaseClient } from '@supabase/supabase-js';

import * as activities from '../repositories/activity-repository';
import { syncBody } from '../repositories/body-repository';
import * as routeRepo from '../repositories/route-repository';
import * as archiveRepo from '../repositories/plan-archive-repository';
import { pullActivities } from './activities-remote';
import { pullArchive, pushArchive } from './archive-remote';
import { resolveArchive, resolvePlan, resolveWorkouts } from './merge';
import * as remote from './remote';
import { stravaRouteDraft, stravaRouteId } from '../routes/build';
import { pullRoutes, pullStravaRoutes, pullStreams, pushRoutes } from './routes-remote';
import * as local from './sync-repository';

/**
 * One sync run: push local changes, then pull and merge server changes ("last write wins" per
 * workout, see merge.ts). SQLite stays the source for the UI; the server is sync and backup.
 * Returns whether local data changed, so the caller can refresh the screens.
 */
export async function syncOnce(
  client: SupabaseClient,
  userId: string,
): Promise<{ changed: boolean }> {
  let changed = false;

  // Data of another account must not be pushed into this one. Data created before the first
  // sign-in (the quiz runs before the account exists) is adopted by the first account.
  const owner = await local.getSyncValue('sync.userId');
  if (owner !== null && owner !== userId) {
    local.clearSyncedData();
    changed = true;
  }
  if (owner !== userId) await local.setSyncValue('sync.userId', userId);

  // Push: the plan before its workouts (foreign key on the server).
  const pending = local.readPendingChanges();
  if (pending.plan) await remote.pushPlan(client, userId, pending.plan);
  if (pending.workouts.length > 0) await remote.pushWorkouts(client, userId, pending.workouts);
  if (pending.tombstones.length > 0)
    await remote.pushTombstones(client, userId, pending.tombstones);
  local.markPushed(pending);

  // Pull.
  const cursor = await local.getSyncValue('sync.cursor');
  const changes = await remote.pullChanges(client, cursor);
  const versions = local.readLocalVersions();
  const decision = resolvePlan(versions.plan, versions.planTombstones, changes.plans);

  let planId = versions.plan?.id ?? null;
  let workoutVersions = versions.workouts;
  switch (decision.kind) {
    case 'adopt': {
      const workouts = await remote.pullPlanWorkouts(client, decision.plan.id);
      local.adoptPlanFromServer(decision.plan, workouts);
      // All of the plan's workouts were just written; newer ones in `changes` still apply below.
      planId = decision.plan.id;
      workoutVersions = new Map(workouts.map((w) => [w.id, w.updatedAt]));
      changed = true;
      break;
    }
    case 'update':
      local.updatePlanFromServer(decision.plan);
      changed = true;
      break;
    case 'delete':
      local.deletePlanFromServer(decision.planId);
      planId = null;
      changed = true;
      break;
    case 'none':
      break;
  }

  if (planId) {
    const { upserts, deletes } = resolveWorkouts(planId, workoutVersions, changes.workouts);
    if (upserts.length > 0 || deletes.length > 0) {
      local.applyWorkoutsFromServer(planId, upserts, deletes);
      changed = true;
    }
  }

  if (changes.cursor && changes.cursor !== cursor)
    await local.setSyncValue('sync.cursor', changes.cursor);

  // Plan history: archived plans are snapshots of their own, so a failure does not stop the rest.
  try {
    changed = (await syncArchive(client, userId)) || changed;
  } catch (error) {
    console.warn('Plan archive sync failed', error);
  }
  // Imported activities (read-only for the app). A failure here must not stop the plan sync.
  try {
    changed = (await pullActivityChanges(client)) || changed;
  } catch (error) {
    console.warn('Activity pull failed', error);
  }
  // Route library and activity streams (Phase 8): same rule, failures do not stop the rest.
  try {
    changed = (await syncRoutes(client, userId)) || changed;
  } catch (error) {
    console.warn('Route sync failed', error);
  }
  try {
    changed = (await pullStreamChanges(client)) || changed;
  } catch (error) {
    console.warn('Stream pull failed', error);
  }
  try {
    changed = (await pullStravaRouteChanges(client)) || changed;
  } catch (error) {
    console.warn('Strava route pull failed', error);
  }
  // Body add-on (Phase 11b): the server accepts writes only with the add-on (RLS).
  try {
    changed = (await syncBody(client, userId)) || changed;
  } catch (error) {
    console.warn('Body sync failed', error);
  }
  return { changed };
}

/**
 * Routes planned in Strava land in the library on their own (stable id per Strava route, so an
 * edited route replaces the old version and a deleted one disappears). The library push of the
 * next sync backs them up like any other route.
 */
async function pullStravaRouteChanges(client: SupabaseClient): Promise<boolean> {
  const cursor = await local.getSyncValue('sync.stravaRoutesCursor');
  const { changes, cursor: next } = await pullStravaRoutes(client, cursor);
  let changed = false;
  for (const c of changes) {
    const id = stravaRouteId(c.externalId);
    const draft = c.gpx ? stravaRouteDraft(c.externalId, c.name, c.sport, c.gpx) : null;
    if (draft) {
      await routeRepo.saveRoute({ ...draft, id });
      changed = true;
    } else if (await routeRepo.getRoute(id)) {
      await routeRepo.deleteRoute(id);
      changed = true;
    }
  }
  if (next && next !== cursor) await local.setSyncValue('sync.stravaRoutesCursor', next);
  return changed;
}

async function syncArchive(client: SupabaseClient, userId: string): Promise<boolean> {
  const dirty = archiveRepo.readDirtyArchive();
  if (dirty.length > 0) {
    await pushArchive(client, userId, dirty);
    archiveRepo.markArchivePushed(dirty);
  }
  const cursor = await local.getSyncValue('sync.archiveCursor');
  const { rows, cursor: next } = await pullArchive(client, cursor);
  const newer = resolveArchive(archiveRepo.readArchiveVersions(), rows);
  if (newer.length > 0) archiveRepo.applyArchiveFromServer(newer);
  if (next && next !== cursor) await local.setSyncValue('sync.archiveCursor', next);
  return newer.length > 0;
}

async function syncRoutes(client: SupabaseClient, userId: string): Promise<boolean> {
  const dirty = routeRepo.readDirtyRoutes();
  if (dirty.length > 0) {
    await pushRoutes(client, userId, dirty);
    routeRepo.markRoutesPushed(dirty);
  }
  const cursor = await local.getSyncValue('sync.routesCursor');
  const { routes, cursor: next } = await pullRoutes(client, cursor);
  const changed = routes.length > 0 && routeRepo.applyRoutesFromServer(routes);
  if (next && next !== cursor) await local.setSyncValue('sync.routesCursor', next);
  return changed;
}

async function pullStreamChanges(client: SupabaseClient): Promise<boolean> {
  const cursor = await local.getSyncValue('sync.streamsCursor');
  const { upserts, deletes, cursor: next } = await pullStreams(client, cursor);
  if (upserts.length > 0 || deletes.length > 0) routeRepo.applyStreams(upserts, deletes);
  if (next && next !== cursor) await local.setSyncValue('sync.streamsCursor', next);
  return upserts.length > 0 || deletes.length > 0;
}

async function pullActivityChanges(client: SupabaseClient): Promise<boolean> {
  const cursor = await local.getSyncValue('sync.activitiesCursor');
  const { upserts, deletes, cursor: next } = await pullActivities(client, cursor);
  if (upserts.length > 0 || deletes.length > 0) activities.applyActivities(upserts, deletes);
  if (next && next !== cursor) await local.setSyncValue('sync.activitiesCursor', next);
  return upserts.length > 0 || deletes.length > 0;
}
