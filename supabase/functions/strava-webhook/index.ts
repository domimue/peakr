/**
 * Strava Webhook Events API (one subscription per Strava app, see supabase/README.md).
 *
 *   GET  /strava-webhook   ?hub.mode=subscribe&hub.challenge&hub.verify_token
 *        Subscription validation: echoes the challenge if the verify token matches.
 *   POST /strava-webhook   { object_type, object_id, aspect_type, owner_id, subscription_id, updates }
 *        activity create / update → fetch the activity and store it (+ wake the app with a push);
 *        activity delete → tombstone; athlete update with `authorized: "false"` (the athlete
 *        revoked Peakr at Strava) → delete tokens and all Strava data of that user.
 *
 * Strava wants a 200 within two seconds, so the work continues after the response
 * (`EdgeRuntime.waitUntil`); a missed event is picked up by the nightly catch-up.
 * `verify_jwt = false`: Strava sends no JWT. Events are only trusted for athletes that connected
 * Peakr, and only with our subscription id (STRAVA_SUBSCRIPTION_ID, once known).
 */

import {
  deleteActivity,
  importActivity,
  integrationForAthlete,
  removeStravaData,
} from '../_shared/strava.ts';
import { adminClient, json } from '../_shared/supabase.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

interface StravaEvent {
  object_type: 'activity' | 'athlete';
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, string>;
}

function validate(url: URL): Response {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = Deno.env.get('STRAVA_WEBHOOK_VERIFY_TOKEN');
  if (mode !== 'subscribe' || !challenge || !expected || token !== expected) {
    return json({ error: 'forbidden' }, 403);
  }
  return json({ 'hub.challenge': challenge });
}

async function handle(event: StravaEvent): Promise<void> {
  const admin = adminClient();
  const integration = await integrationForAthlete(admin, String(event.owner_id));
  // Not (or no longer) connected to Peakr: nothing to do.
  if (!integration) return;

  if (event.object_type === 'athlete') {
    if (event.updates?.authorized === 'false') await removeStravaData(admin, integration.user_id);
    return;
  }
  const activityId = String(event.object_id);
  if (event.aspect_type === 'delete') {
    await deleteActivity(admin, integration.user_id, activityId);
    return;
  }
  await importActivity(admin, integration, activityId, event.aspect_type === 'create');
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') return validate(url);
  if (req.method !== 'POST') return json({ error: 'not_found' }, 404);

  let event: StravaEvent;
  try {
    event = (await req.json()) as StravaEvent;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const subscription = Deno.env.get('STRAVA_SUBSCRIPTION_ID');
  if (subscription && String(event.subscription_id) !== subscription) {
    return json({ error: 'forbidden' }, 403);
  }
  if (!event.owner_id || !event.object_id) return json({ ok: true });

  EdgeRuntime.waitUntil(
    handle(event).catch((error) => console.error('Strava event failed', event, String(error))),
  );
  return json({ ok: true });
});
