/**
 * Pulls Strava activities for the cases the webhook missed.
 *
 *   POST /strava-sync          (Authorization: user JWT)  → { imported, lastSyncedAt }
 *        "Sync now" in the app: activities since the last import (at most the last 30 days).
 *   POST /strava-sync/nightly  (x-cron-secret: CRON_SECRET)  → { users, imported, failed }
 *        Nightly catch-up (pg_cron, see the migration): the last 48 hours of every connected
 *        athlete. Stops early when Strava's rate limit is hit; the next night continues.
 *
 * `verify_jwt = false` because the cron call carries a secret instead of a JWT; the user route
 * checks the JWT itself.
 */

import {
  activeIntegrations,
  importSince,
  integrationForUser,
  StravaError,
} from '../_shared/strava.ts';
import { adminClient, json, userFromRequest } from '../_shared/supabase.ts';

const DAY_MS = 86_400_000;
const MANUAL_WINDOW_MS = 30 * DAY_MS;
/** Overlap with the last import, for activities uploaded late (watch synced hours later). */
const MANUAL_OVERLAP_MS = 2 * DAY_MS;
const NIGHTLY_WINDOW_MS = 2 * DAY_MS;

async function syncNow(req: Request): Promise<Response> {
  const admin = adminClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const integration = await integrationForUser(admin, user.id);
  if (!integration) return json({ error: 'not_connected' }, 404);
  const now = Date.now();
  const last = integration.last_synced_at ? Date.parse(integration.last_synced_at) : 0;
  const after = Math.max(now - MANUAL_WINDOW_MS, last - MANUAL_OVERLAP_MS);
  try {
    const imported = await importSince(admin, integration, after);
    return json({ imported, lastSyncedAt: integration.last_synced_at });
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
      imported += await importSince(admin, integration, after, 1);
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
    if (req.method === 'POST' && path.endsWith('/strava-sync')) return await syncNow(req);
    return json({ error: 'not_found' }, 404);
  } catch (error) {
    console.error('strava-sync failed', String(error));
    return json({ error: 'internal' }, 500);
  }
});
