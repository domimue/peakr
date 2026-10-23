/**
 * Watch integrations for the app (CLAUDE.md "Watch integrations"). All endpoints take the user's
 * JWT; tokens and API keys of the platforms stay here.
 *
 *   POST /watch/export  { workouts?, route? }                → { files: [{ name, mime, base64 }] }
 *        FIT workout files and a GPX course, generated here. Works for every watch brand (the
 *        universal fallback) and is the path when encoding on the device is not an option.
 *        Not behind a feature flag: it needs no platform account.
 *   POST /watch/push    { provider, workouts, today }        → { items, stopped }
 *        Garmin Training API / COROS plan / Suunto: pushes the planned workouts and re-syncs on
 *        change (updates moved ones, removes dropped ones). Failure `not_available` while the
 *        platform's flag is off.
 *   POST /watch/route   { provider, route }                  → { items }
 *        Garmin Courses API (publish only) / Suunto routes.
 *   POST /watch/import  { provider, since }                  → { imported }
 *        Pulls activities where the platform allows it (COROS); Garmin Starter access and Suunto
 *        deliver by webhook only (see watch-webhook).
 *   GET  /watch/status                                       → { providers: [{ provider, state }] }
 *        Per platform: `unavailable` (flag off), `disconnected`, `connected`.
 *
 * Feature flags: WATCH_GARMIN_TRAINING, WATCH_GARMIN_COURSES, WATCH_COROS, WATCH_SUUNTO.
 */

import { adminClient, json, userFromRequest } from '../_shared/supabase.ts';
import {
  integrationFor,
  loadPushed,
  savePushed,
  storeWatchActivities,
  watchAccessToken,
  WatchAuthError,
  type WatchIntegration,
  type WatchPlatform,
} from '../_shared/watch-store.ts';
import { createCorosApi, importCorosActivities, syncCorosPlan } from '../_shared/watch/coros.ts';
import { flagEnabled, type WatchFlag } from '../_shared/watch/flags.ts';
import { encodeWorkoutFit } from '../_shared/watch/fit-workout.ts';
import {
  createGarminCoursesApi,
  createGarminTrainingApi,
  publishGarminCourse,
  syncGarminWorkouts,
} from '../_shared/watch/garmin.ts';
import { routeToGpx } from '../_shared/watch/gpx-course.ts';
import type { PushItem, WatchFailure } from '../_shared/watch/model.ts';
import { workoutHash, type PushedRecord } from '../_shared/watch/sync.ts';
import { createSuuntoApi } from '../_shared/watch/suunto.ts';
import * as validate from '../_shared/watch/validate.ts';

const env = (name: string) => Deno.env.get(name);
const PLATFORMS: readonly WatchPlatform[] = ['garmin', 'coros', 'suunto'];

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'workout';

function platformFlag(provider: WatchPlatform, kind: 'workouts' | 'routes'): WatchFlag {
  if (provider === 'garmin') return kind === 'workouts' ? 'garminTraining' : 'garminCourses';
  return provider;
}

const failure = (f: WatchFailure, detail?: string, status = 200) =>
  json({ ok: false, failure: f, ...(detail ? { detail } : {}) }, status);

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = (await req.json()) as unknown;
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function platformOf(value: unknown): WatchPlatform | null {
  return PLATFORMS.find((p) => p === value) ?? null;
}

async function exportFiles(req: Request): Promise<Response> {
  const b = await body(req);
  const files: { name: string; mime: string; base64: string }[] = [];
  if (b.workouts !== undefined) {
    const workouts = validate.workouts(b.workouts);
    if (!workouts) return json({ error: 'bad_workouts' }, 400);
    for (const w of workouts) {
      files.push({
        name: `${w.date}-${slug(w.name)}.fit`,
        mime: 'application/vnd.ant.fit',
        base64: toBase64(encodeWorkoutFit(w)),
      });
    }
  }
  if (b.route !== undefined) {
    const route = validate.route(b.route);
    if (!route) return json({ error: 'bad_route' }, 400);
    files.push({
      name: `${slug(route.name)}.gpx`,
      mime: 'application/gpx+xml',
      base64: toBase64(new TextEncoder().encode(routeToGpx(route))),
    });
  }
  return json({ files });
}

type Admin = ReturnType<typeof adminClient>;

type Connection =
  | { fail: WatchFailure }
  | { fail?: undefined; integration: WatchIntegration; token: string };

/** Connected account + token, or the failure to report. */
async function connection(
  admin: Admin,
  userId: string,
  provider: WatchPlatform,
): Promise<Connection> {
  const integration = await integrationFor(admin, userId, provider);
  if (!integration || integration.status !== 'active') return { fail: 'not_connected' };
  try {
    return { integration, token: await watchAccessToken(admin, integration) };
  } catch (e) {
    if (e instanceof WatchAuthError) return { fail: 'not_connected' };
    throw e;
  }
}

async function push(req: Request, userId: string): Promise<Response> {
  const b = await body(req);
  const provider = platformOf(b.provider);
  const workouts = validate.workouts(b.workouts);
  const today = typeof b.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.today) ? b.today : null;
  if (!provider || !workouts || !today) return json({ error: 'bad_request' }, 400);
  if (!flagEnabled(env, platformFlag(provider, 'workouts'))) return failure('not_available');
  const admin = adminClient();
  const conn = await connection(admin, userId, provider);
  if (conn.fail) return failure(conn.fail);

  if (provider === 'garmin') {
    const api = createGarminTrainingApi({ fetch, accessToken: conn.token });
    const out = await syncGarminWorkouts(api, workouts, await loadPushed(admin, userId, provider));
    await savePushed(admin, userId, provider, out.records);
    return json({ ok: true, items: out.items, stopped: out.stopped });
  }
  if (provider === 'coros') {
    if (!conn.integration.external_user_id) return failure('not_connected');
    const api = createCorosApi({
      fetch,
      accessToken: conn.token,
      openId: conn.integration.external_user_id,
    });
    const previous = new Map(workouts.map((w) => [w.id, w]));
    const out = await syncCorosPlan(
      api,
      workouts,
      today,
      await loadPushed(admin, userId, provider),
      previous,
    );
    await savePushed(admin, userId, provider, out.records);
    return json({ ok: true, items: out.items, stopped: out.stopped });
  }
  // Suunto: no update/remove calls are known, so each run sends what changed since the last one.
  const subscriptionKey = env('SUUNTO_SUBSCRIPTION_KEY');
  if (!subscriptionKey) return failure('not_available');
  const api = createSuuntoApi({ fetch, accessToken: conn.token, subscriptionKey });
  const pushed = await loadPushed(admin, userId, provider);
  const known = new Map(pushed.map((p) => [p.workoutId, p]));
  const changed = workouts.filter((w) => known.get(w.id)?.hash !== workoutHash(w));
  const result = await api.pushWorkouts(changed);
  if (!result.ok) return failure(result.failure, result.detail);
  const records: PushedRecord[] = [...pushed];
  const items: PushItem[] = [];
  for (const item of result.items) {
    items.push(item);
    const w = changed.find((c) => c.id === item.id);
    if (item.ok && w) {
      const record = { workoutId: w.id, externalId: item.externalId ?? w.id, hash: workoutHash(w) };
      const i = records.findIndex((r) => r.workoutId === w.id);
      if (i >= 0) records[i] = record;
      else records.push(record);
    }
  }
  await savePushed(admin, userId, provider, records);
  return json({ ok: true, items, stopped: null });
}

async function pushRoute(req: Request, userId: string): Promise<Response> {
  const b = await body(req);
  const provider = platformOf(b.provider);
  const route = validate.route(b.route);
  if (!provider || !route) return json({ error: 'bad_request' }, 400);
  if (provider === 'coros') return failure('unsupported', 'COROS takes no routes through the API');
  if (!flagEnabled(env, platformFlag(provider, 'routes'))) return failure('not_available');
  const admin = adminClient();
  const conn = await connection(admin, userId, provider);
  if (conn.fail) return failure(conn.fail);

  let result;
  if (provider === 'garmin') {
    // The Courses API only publishes courses to Garmin Connect; it cannot read existing ones.
    result = await publishGarminCourse(
      createGarminCoursesApi({ fetch, accessToken: conn.token }),
      route,
    );
  } else {
    const subscriptionKey = env('SUUNTO_SUBSCRIPTION_KEY');
    if (!subscriptionKey) return failure('not_available');
    result = await createSuuntoApi({ fetch, accessToken: conn.token, subscriptionKey }).pushRoute(
      route,
    );
  }
  if (!result.ok) return failure(result.failure, result.detail);
  const item = result.items[0];
  if (item?.ok && item.externalId) {
    await savePushed(
      admin,
      userId,
      provider,
      [
        ...(await loadPushed(admin, userId, provider, 'route')).filter((r) => r.workoutId !== route.id),
        { workoutId: route.id, externalId: item.externalId, hash: String(route.points.length) },
      ],
      'route',
    );
  }
  return json({ ok: true, items: result.items });
}

async function importActivities(req: Request, userId: string): Promise<Response> {
  const b = await body(req);
  const provider = platformOf(b.provider);
  const since = typeof b.since === 'string' ? new Date(b.since) : null;
  if (!provider || !since || Number.isNaN(since.getTime())) return json({ error: 'bad_request' }, 400);
  if (provider !== 'coros') {
    // Garmin Starter access is push only; Suunto delivers by webhook.
    return failure('unsupported', 'This platform delivers activities by webhook');
  }
  if (!flagEnabled(env, 'coros')) return failure('not_available');
  const admin = adminClient();
  const conn = await connection(admin, userId, provider);
  if (conn.fail) return failure(conn.fail);
  if (!conn.integration.external_user_id) return failure('not_connected');
  const api = createCorosApi({
    fetch,
    accessToken: conn.token,
    openId: conn.integration.external_user_id,
  });
  const result = await importCorosActivities(api, userId, since);
  if (!result.ok) return failure(result.failure, result.detail);
  await storeWatchActivities(admin, result.rows);
  return json({ ok: true, imported: result.rows.length });
}

async function status(userId: string): Promise<Response> {
  const admin = adminClient();
  const providers = [];
  for (const provider of PLATFORMS) {
    const available =
      flagEnabled(env, platformFlag(provider, 'workouts')) ||
      flagEnabled(env, platformFlag(provider, 'routes')) ||
      (provider === 'garmin' && flagEnabled(env, 'garminActivity'));
    const integration = available ? await integrationFor(admin, userId, provider) : null;
    providers.push({
      provider,
      state: !available ? 'unavailable' : integration?.status === 'active' ? 'connected' : 'disconnected',
    });
  }
  return json({ providers });
}

Deno.serve(async (req) => {
  const admin = adminClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const path = new URL(req.url).pathname;
  try {
    if (req.method === 'GET' && path.endsWith('/watch/status')) return await status(user.id);
    if (req.method !== 'POST') return json({ error: 'not_found' }, 404);
    if (path.endsWith('/watch/export')) return await exportFiles(req);
    if (path.endsWith('/watch/push')) return await push(req, user.id);
    if (path.endsWith('/watch/route')) return await pushRoute(req, user.id);
    if (path.endsWith('/watch/import')) return await importActivities(req, user.id);
    return json({ error: 'not_found' }, 404);
  } catch (error) {
    console.error('watch function failed', path, String(error));
    return json({ error: 'internal' }, 500);
  }
});
