/**
 * Pulls Strava activities for the cases the webhook missed.
 *
 *   POST /strava-sync          (Authorization: user JWT)  → { imported, lastSyncedAt, routes }
 *        "Sync now" in the app: activities since the last import (at most the last 30 days), plus
 *        the streams of up to 10 new outdoor runs/rides and the athlete's Strava routes
 *        (`routes` = { imported, removed }).
 *   POST /strava-sync/history  (Authorization: user JWT)  → { imported, lastSyncedAt }
 *        Activity summaries of the last 180 days (route recognition, history), without streams.
 *   POST /strava-sync/streams  (Authorization: user JWT, body { externalIds: string[] ≤ 10 })
 *        → { stored, skipped }  Fetches and stores the streams of the user's own activities.
 *   POST /strava-sync/routes   (Authorization: user JWT)  → { imported, removed }
 *        Routes planned in Strava (rides and runs): GPX exports only for new or changed routes.
 *   POST /strava-sync/nightly  (x-cron-secret: CRON_SECRET)  → { users, imported, failed }
 *        Nightly catch-up (pg_cron, see the migration): the last 48 hours of every connected
 *        athlete (summaries only; the app asks for missing streams) and their Strava routes. Stops
 *        early when Strava's rate limit is hit; the next night continues.
 *
 * `verify_jwt = false` because the cron call carries a secret instead of a JWT; the user route
 * checks the JWT itself.
 */

import {
  accessToken,
  activeIntegrations,
  importSince,
  importStravaRoutes,
  importStreams,
  integrationForUser,
  StravaError,
  type StravaIntegration,
  wantsStreams,
} from '../_shared/strava.ts';
import { adminClient, json, userFromRequest } from '../_shared/supabase.ts';

const DAY_MS = 86_400_000;
const MANUAL_WINDOW_MS = 30 * DAY_MS;
/** Overlap with the last import, for activities uploaded late (watch synced hours later). */
const MANUAL_OVERLAP_MS = 2 * DAY_MS;
const NIGHTLY_WINDOW_MS = 2 * DAY_MS;
const HISTORY_WINDOW_MS = 180 * DAY_MS;
/** List pages of 100 for the history import (up to 1,000 activities). */
const HISTORY_PAGES = 10;
/** Streams fetched per request (each costs one Strava API call). */
const MAX_STREAMS = 10;

type Admin = ReturnType<typeof adminClient>;

/** Runs a user route for the signed-in user's Strava connection; maps Strava errors for the app. */
async function forUser(
  req: Request,
  run: (admin: Admin, integration: StravaIntegration) => Promise<Response>,
): Promise<Response> {
  const admin = adminClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const integration = await integrationForUser(admin, user.id);
  if (!integration) return json({ error: 'not_connected' }, 404);
  try {
    return await run(admin, integration);
  } catch (error) {
    if (error instanceof StravaError && error.status === 429) {
      return json({ error: 'rate_limited' }, 429);
    }
    if (error instanceof StravaError && error.status === 401) {
      return json({ error: 'reconnect' }, 409);
    }
    throw error;
  }
}

function syncNow(req: Request): Promise<Response> {
  return forUser(req, async (admin, integration) => {
    const now = Date.now();
    const last = integration.last_synced_at ? Date.parse(integration.last_synced_at) : 0;
    const after = Math.max(now - MANUAL_WINDOW_MS, last - MANUAL_OVERLAP_MS);
    const imported = await importSince(admin, integration, after, { maxStreams: MAX_STREAMS });
    const routes = await importStravaRoutes(admin, integration);
    return json({ imported, lastSyncedAt: integration.last_synced_at, routes });
  });
}

function history(req: Request): Promise<Response> {
  return forUser(req, async (admin, integration) => {
    const after = Date.now() - HISTORY_WINDOW_MS;
    const imported = await importSince(admin, integration, after, { maxPages: HISTORY_PAGES });
    return json({ imported, lastSyncedAt: integration.last_synced_at });
  });
}

function routes(req: Request): Promise<Response> {
  return forUser(req, async (admin, integration) =>
    json(await importStravaRoutes(admin, integration)),
  );
}

/** `{ externalIds }` → unique ids of 1–64 characters, or null if the body is not valid. */
async function externalIdsFrom(req: Request): Promise<string[] | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  const ids = (body as { externalIds?: unknown } | null)?.externalIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_STREAMS) return null;
  if (!ids.every((id) => typeof id === 'string' && id.length >= 1 && id.length <= 64)) return null;
  return [...new Set(ids as string[])];
}

async function streams(req: Request): Promise<Response> {
  const externalIds = await externalIdsFrom(req);
  if (!externalIds) return json({ error: 'bad_request' }, 400);
  return forUser(req, async (admin, integration) => {
    // Only the user's own, stored, outdoor runs and rides.
    const { data, error } = await admin
      .from('activities')
      .select('external_id, sport, indoor')
      .eq('user_id', integration.user_id)
      .eq('source', 'strava')
      .eq('deleted', false)
      .in('external_id', externalIds);
    if (error) throw error;
    const eligible = (data ?? [])
      .filter((a) => wantsStreams(a as { sport: string | null; indoor: boolean }))
      .map((a) => a.external_id as string);
    const token = await accessToken(admin, integration);
    const stored: string[] = [];
    for (const id of eligible) {
      if (await importStreams(admin, token, integration.user_id, id)) stored.push(id);
    }
    return json({ stored, skipped: externalIds.filter((id) => !stored.includes(id)) });
  });
}

async function nightly(req: Request): Promise<Response> {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }
  const admin = adminClient();
  const after = Date.now() - NIGHTLY_WINDOW_MS;
  let imported = 0;
  let failed = 0;
  const integrations = await activeIntegrations(admin);
  for (const integration of integrations) {
    try {
      imported += await importSince(admin, integration, after, { maxPages: 1 });
      await importStravaRoutes(admin, integration);
    } catch (error) {
      failed++;
      if (error instanceof StravaError && error.status === 429) {
        console.warn('Strava rate limit reached; the rest follows next night');
        break;
      }
      console.error('Nightly Strava sync failed', integration.user_id, String(error));
    }
  }
  return json({ users: integrations.length, imported, failed });
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname;
  try {
    if (req.method === 'POST' && path.endsWith('/strava-sync/nightly')) return await nightly(req);
    if (req.method === 'POST' && path.endsWith('/strava-sync/history')) return await history(req);
    if (req.method === 'POST' && path.endsWith('/strava-sync/streams')) return await streams(req);
    if (req.method === 'POST' && path.endsWith('/strava-sync/routes')) return await routes(req);
    if (req.method === 'POST' && path.endsWith('/strava-sync')) return await syncNow(req);
    return json({ error: 'not_found' }, 404);
  } catch (error) {
    console.error('strava-sync failed', String(error));
    return json({ error: 'internal' }, 500);
  }
});
