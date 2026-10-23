import { activityFromFit } from './activity-map.ts';
import { requestJson, type Fetch } from './http.ts';
import type { PushResult, WatchActivityRow, WatchRoute, WatchWorkout } from './model.ts';
import { routeToGpx } from './gpx-course.ts';
import { encodeWorkoutFit } from './fit-workout.ts';

/**
 * Suunto Cloud API (Suunto partner programme, business application, reviewed in about two
 * weeks): push routes (GPX) and workouts (FIT) to the Suunto app and watch, and receive a webhook
 * for every completed workout. Behind `WATCH_SUUNTO` until Suunto has approved Peakr.
 *
 * VERIFIED (apizone.suunto.com FAQ): routes are GPX files; workout upload is a multi-stage flow
 * that starts with an upload initialisation; the partner notification for a new workout is a POST
 * with the parameters `username` and `workoutid`, where `username` identifies the user's access
 * token and `workoutid` is used to fetch the FIT file; there is no notification for daily data.
 * NOT VERIFIED (reference is for approved partners): the exact paths and body fields below, and
 * whether planned structured workouts are accepted at all – CLAUDE.md says to confirm that with
 * Suunto; if a 404/405 comes back, `pushWorkouts` reports `unsupported` and the app offers the
 * file export instead of pretending.
 */

export const SUUNTO = {
  verified: false,
  authorizeUrl: 'https://cloudapi-oauth.suunto.com/oauth/authorize',
  tokenUrl: 'https://cloudapi-oauth.suunto.com/oauth/token',
  apiBase: 'https://cloudapi.suunto.com',
} as const;

export interface SuuntoClientOptions {
  fetch: Fetch;
  accessToken: string;
  /** The "Ocp-Apim-Subscription-Key" of the Developer API product (Suunto API Zone). */
  subscriptionKey: string;
  base?: string;
}

const toBase64 = (text: string): string => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

export interface SuuntoApi {
  pushRoute(route: WatchRoute): Promise<PushResult>;
  pushWorkouts(workouts: readonly WatchWorkout[]): Promise<PushResult>;
  downloadWorkoutFit(workoutId: string): Promise<Uint8Array | null>;
}

export function createSuuntoApi(o: SuuntoClientOptions): SuuntoApi {
  const base = o.base ?? SUUNTO.apiBase;
  const headers = {
    Authorization: `Bearer ${o.accessToken}`,
    'Ocp-Apim-Subscription-Key': o.subscriptionKey,
  };
  const idOf = (body: unknown): string | undefined => {
    const v = (body as Record<string, unknown> | null)?.id;
    return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
  };
  return {
    async pushRoute(route) {
      const r = await requestJson(o.fetch, `${base}/v2/route/import`, {
        method: 'POST',
        headers,
        json: {
          name: route.name.slice(0, 80),
          activity: route.sport === 'run' ? 'running' : 'cycling',
          gpx: toBase64(routeToGpx(route)),
        },
      });
      if (!r.ok) return { ok: false, failure: r.failure, detail: r.detail };
      return { ok: true, items: [{ id: route.id, ok: true, externalId: idOf(r.body) }] };
    },
    async pushWorkouts(workouts) {
      const items = [];
      for (const w of workouts) {
        const r = await requestJson(o.fetch, `${base}/v2/workout/import`, {
          method: 'POST',
          headers,
          json: {
            name: w.name.slice(0, 80),
            date: w.date,
            sport: w.sport,
            fit: bytesToBase64(encodeWorkoutFit(w)),
          },
        });
        if (!r.ok) {
          // Suunto may not take planned workouts: stop at once and let the app offer the file.
          if (r.failure === 'unsupported' || r.failure === 'not_connected') {
            return { ok: false, failure: r.failure, detail: r.detail };
          }
          items.push({ id: w.id, ok: false, failure: r.failure, detail: r.detail });
          continue;
        }
        items.push({ id: w.id, ok: true, externalId: idOf(r.body) });
      }
      return { ok: true, items };
    },
    async downloadWorkoutFit(workoutId) {
      try {
        const response = await o.fetch(`${base}/v2/workout/${encodeURIComponent(workoutId)}/fit`, {
          headers,
        });
        return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
      } catch {
        return null;
      }
    },
  };
}

/** The body of Suunto's workout notification. */
export function parseSuuntoNotification(
  body: unknown,
): { username: string; workoutId: string } | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const username = typeof b.username === 'string' ? b.username : null;
  const id = b.workoutid ?? b.workoutId;
  const workoutId = typeof id === 'string' || typeof id === 'number' ? String(id) : null;
  return username && workoutId ? { username, workoutId } : null;
}

/** Fetches the FIT file of a notified workout and maps it like any other activity. */
export async function importSuuntoWorkout(
  api: SuuntoApi,
  userId: string,
  workoutId: string,
): Promise<WatchActivityRow | null> {
  const bytes = await api.downloadWorkoutFit(workoutId);
  return bytes ? activityFromFit('suunto', userId, workoutId, bytes) : null;
}

/**
 * Verifies the HMAC-SHA256 signature of a webhook body (header `X-HMAC-SHA256-Signature`, hex or
 * base64). Per a third-party integration guide, not yet confirmed by Suunto's own reference – so
 * the function treats an absent secret as "not configured" and the endpoint then relies on the
 * secret path token instead.
 */
export async function verifySuuntoSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(signature.toLowerCase(), hex) || timingSafeEqual(signature, bytesToBase64(mac));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
