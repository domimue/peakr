/**
 * Receiver for the completed-activity notifications of the watch platforms. Everything lands in the
 * same `activities` table as Strava's activities, so the app deduplicates and matches them with
 * the same rules (watch provider > Strava > Health data) and the user's devices are woken the same
 * way (CLAUDE.md "Automatic activity sync").
 *
 *   POST /watch-webhook/garmin?key=…   Garmin Activity API push (JSON: activities, deregistrations)
 *   POST /watch-webhook/coros?key=…    COROS activity push (JSON with the user's openId and FIT links)
 *   POST /watch-webhook/suunto?key=…   Suunto workout notification ({ username, workoutid })
 *
 * `verify_jwt = false`: the platforms send no Supabase JWT. Each request must carry the secret in
 * the callback URL you register at the platform (`WATCH_WEBHOOK_SECRET`, as `?key=`) – Suunto
 * notifications additionally carry an HMAC when `SUUNTO_WEBHOOK_HMAC_SECRET` is set. The platforms
 * retry on errors and time out slowly, so every accepted request answers 200 at once and the work
 * continues afterwards (`EdgeRuntime.waitUntil`); a missed push is caught by the next sync.
 * Flags: WATCH_GARMIN_ACTIVITY, WATCH_COROS, WATCH_SUUNTO.
 */

import { adminClient, json } from '../_shared/supabase.ts';
import {
  integrationForExternal,
  removeWatchData,
  storeWatchActivities,
  tombstoneWatchActivity,
  watchAccessToken,
} from '../_shared/watch-store.ts';
import { activityFromFit, buildActivityRow } from '../_shared/watch/activity-map.ts';
import { createCorosApi } from '../_shared/watch/coros.ts';
import { flagEnabled } from '../_shared/watch/flags.ts';
import { parseGarminPush } from '../_shared/watch/garmin.ts';
import {
  createSuuntoApi,
  importSuuntoWorkout,
  parseSuuntoNotification,
  verifySuuntoSignature,
} from '../_shared/watch/suunto.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const env = (name: string) => Deno.env.get(name);

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorised(url: URL): boolean {
  const secret = env('WATCH_WEBHOOK_SECRET');
  const key = url.searchParams.get('key');
  return !!secret && !!key && constantTimeEqual(key, secret);
}

async function garmin(body: unknown): Promise<void> {
  const admin = adminClient();
  const push = parseGarminPush(body);
  for (const garminUserId of push.deregistered) {
    // The user revoked Peakr at Garmin: their Garmin data and connection go.
    const integration = await integrationForExternal(admin, 'garmin', garminUserId);
    if (!integration) continue;
    await removeWatchData(admin, integration.user_id, 'garmin');
    await admin.from('integrations').delete().eq('id', integration.id);
  }
  for (const a of push.activities) {
    const integration = await integrationForExternal(admin, 'garmin', a.garminUserId);
    // Not (or no longer) connected to Peakr: nothing to do.
    if (!integration) continue;
    const row = buildActivityRow('garmin', integration.user_id, a.externalId, a.parts);
    if (row) await storeWatchActivities(admin, [row]);
  }
}

interface CorosPush {
  openId?: string;
  /** Activity records; `fitUrl` is the download link of the activity's FIT file. */
  data?: { labelId?: string | number; fitUrl?: string }[];
}

async function coros(body: unknown): Promise<void> {
  const admin = adminClient();
  const push = (body ?? {}) as CorosPush;
  if (!push.openId) return;
  const integration = await integrationForExternal(admin, 'coros', push.openId);
  if (!integration) return;
  const token = await watchAccessToken(admin, integration);
  const api = createCorosApi({ fetch, accessToken: token, openId: push.openId });
  for (const item of push.data ?? []) {
    if (item.labelId === undefined || !item.fitUrl) continue;
    const bytes = await api.downloadFit(item.fitUrl);
    const row = bytes
      ? activityFromFit('coros', integration.user_id, String(item.labelId), bytes)
      : null;
    if (row) await storeWatchActivities(admin, [row]);
  }
}

async function suunto(body: unknown): Promise<void> {
  const notification = parseSuuntoNotification(body);
  const subscriptionKey = env('SUUNTO_SUBSCRIPTION_KEY');
  if (!notification || !subscriptionKey) return;
  const admin = adminClient();
  const integration = await integrationForExternal(admin, 'suunto', notification.username);
  if (!integration) return;
  const token = await watchAccessToken(admin, integration);
  const api = createSuuntoApi({ fetch, accessToken: token, subscriptionKey });
  const row = await importSuuntoWorkout(api, integration.user_id, notification.workoutId);
  if (row) await storeWatchActivities(admin, [row]);
  // The FIT file is gone (workout deleted at Suunto): keep no data of it.
  else await tombstoneWatchActivity(admin, integration.user_id, 'suunto', notification.workoutId);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'not_found' }, 404);
  const url = new URL(req.url);
  if (!authorised(url)) return json({ error: 'forbidden' }, 403);

  const raw = await req.text();
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const platform = url.pathname.split('/').filter(Boolean).pop();
  let work: Promise<void>;
  if (platform === 'garmin' && flagEnabled(env, 'garminActivity')) work = garmin(body);
  else if (platform === 'coros' && flagEnabled(env, 'coros')) work = coros(body);
  else if (platform === 'suunto' && flagEnabled(env, 'suunto')) {
    const hmacSecret = env('SUUNTO_WEBHOOK_HMAC_SECRET');
    if (
      hmacSecret &&
      !(await verifySuuntoSignature(raw, req.headers.get('X-HMAC-SHA256-Signature'), hmacSecret))
    ) {
      return json({ error: 'forbidden' }, 403);
    }
    work = suunto(body);
  } else {
    // Unknown platform or its flag is off: accept and ignore, so the platform does not retry.
    return json({ ok: true, ignored: true });
  }
  EdgeRuntime.waitUntil(
    work.catch((error) => console.error('Watch webhook failed', platform, String(error))),
  );
  return json({ ok: true });
});
