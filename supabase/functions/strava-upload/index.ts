/**
 * Posts a finished gym session to Strava (needs the `activity:write` scope).
 *
 *   POST /strava-upload/post    { sessionId, upload }  (Authorization: user JWT)
 *        `upload` is built in the app by `buildStravaUpload` (packages/engine). Structured uploads
 *        go to `POST /uploads` (data_type=json, weight-training sets); plain uploads (explicitly
 *        chosen by the user after "structured_unavailable") create a weight-training activity with
 *        a summary. → { status: 'processing' | 'posted', activityId? }
 *        Errors: 404 not_connected · 403 scope_missing (the app asks for the upgrade) ·
 *        409 reconnect · 422 structured_unavailable (never falls back silently) · 429 rate_limited.
 *   POST /strava-upload/status  { sessionId }  (Authorization: user JWT)
 *        Asks Strava once for the state of that session's upload. The app polls with backoff
 *        (Strava: at most once per second). → { status, activityId?, error? }
 *
 * Own uploads are recorded in `strava_uploads` so the webhook ignores them (strava-own.ts).
 */

import { OWN_DESCRIPTION_MARKER, OWN_EXTERNAL_PREFIX } from '../_shared/strava-own.ts';
import {
  accessToken,
  integrationForUser,
  StravaError,
  type StravaIntegration,
} from '../_shared/strava.ts';
import { adminClient, json, userFromRequest } from '../_shared/supabase.ts';

const API = 'https://www.strava.com/api/v3';
const MAX_SETS = 500;
const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;

type Admin = ReturnType<typeof adminClient>;

interface StructuredUpload {
  format: 'structured';
  name: string;
  payload: { sets: unknown[] } & Record<string, unknown>;
}
interface PlainUpload {
  format: 'plain';
  name: string;
  startTime: string;
  elapsedSec: number;
  description: string;
}
type Upload = StructuredUpload | PlainUpload;

interface UploadStatus {
  id_str?: string;
  error: string | null;
  status: string;
  activity_id: number | null;
}

function parseUpload(value: unknown): Upload | null {
  const u = value as Partial<Upload> | null;
  if (!u || typeof u.name !== 'string') return null;
  if (u.format === 'structured') {
    const sets = (u.payload as { sets?: unknown } | undefined)?.sets;
    if (!Array.isArray(sets) || sets.length === 0 || sets.length > MAX_SETS) return null;
    return u as StructuredUpload;
  }
  if (u.format === 'plain') {
    const p = u as PlainUpload;
    if (typeof p.startTime !== 'string' || Number.isNaN(Date.parse(p.startTime))) return null;
    if (typeof p.description !== 'string' || !(p.elapsedSec > 0)) return null;
    return p;
  }
  return null;
}

async function grantedWrite(admin: Admin, integrationId: string): Promise<boolean> {
  const { data } = await admin
    .from('integrations')
    .select('scopes')
    .eq('id', integrationId)
    .single();
  return ((data?.scopes as string[] | null) ?? []).includes('activity:write');
}

/** Strava error text can contain HTML; keep a short readable reason. */
function reason(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

async function uploadStructured(token: string, sessionId: string, upload: StructuredUpload) {
  const form = new FormData();
  form.set(
    'file',
    new Blob([JSON.stringify(upload.payload)], { type: 'application/json' }),
    `${OWN_EXTERNAL_PREFIX}${sessionId}.json`,
  );
  form.set('data_type', 'json');
  form.set('sport_type', 'WeightTraining');
  form.set('name', upload.name.slice(0, 200));
  form.set('external_id', `${OWN_EXTERNAL_PREFIX}${sessionId}`);
  return fetch(`${API}/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

async function postPlain(token: string, upload: PlainUpload) {
  const body = new URLSearchParams({
    name: upload.name.slice(0, 200),
    sport_type: 'WeightTraining',
    start_date_local: upload.startTime,
    elapsed_time: String(Math.round(upload.elapsedSec)),
    description: `${upload.description}\n\n${OWN_DESCRIPTION_MARKER}`,
  });
  return fetch(`${API}/activities`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
}

async function save(
  admin: Admin,
  userId: string,
  sessionId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from('strava_uploads')
    .upsert(
      { user_id: userId, session_id: sessionId, updated_at: new Date().toISOString(), ...fields },
      { onConflict: 'user_id,session_id' },
    );
  if (error) throw error;
}

async function forUser(
  req: Request,
  run: (
    admin: Admin,
    userId: string,
    integration: StravaIntegration,
    body: Record<string, unknown>,
  ) => Promise<Response>,
): Promise<Response> {
  const admin = adminClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof body.sessionId !== 'string' || !SESSION_ID.test(body.sessionId)) {
    return json({ error: 'bad_request' }, 400);
  }
  const integration = await integrationForUser(admin, user.id);
  if (!integration) return json({ error: 'not_connected' }, 404);
  try {
    return await run(admin, user.id, integration, body);
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

function post(req: Request): Promise<Response> {
  return forUser(req, async (admin, userId, integration, body) => {
    const sessionId = body.sessionId as string;
    const upload = parseUpload(body.upload);
    if (!upload) return json({ error: 'bad_request' }, 400);
    if (!(await grantedWrite(admin, integration.id))) {
      return json({ error: 'scope_missing' }, 403);
    }
    // Already posted (or still being processed): never create a second activity.
    const { data: existing } = await admin
      .from('strava_uploads')
      .select('status, strava_activity_id')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .maybeSingle();
    if (existing?.status === 'posted' || existing?.status === 'processing') {
      return json({ status: existing.status, activityId: existing.strava_activity_id ?? null });
    }

    const token = await accessToken(admin, integration);
    const response =
      upload.format === 'structured'
        ? await uploadStructured(token, sessionId, upload)
        : await postPlain(token, upload);
    const text = await response.text();
    if (response.status === 429) throw new StravaError(429, 'rate limited');
    if (response.status === 401) throw new StravaError(401, 'unauthorized');
    if (!response.ok) {
      // The structured format is the point of this feature: if Strava refuses it for this app,
      // say so instead of quietly posting something weaker.
      const unavailable =
        upload.format === 'structured' && [400, 403, 404, 415, 422].includes(response.status);
      const code = unavailable ? 'structured_unavailable' : 'upload_failed';
      console.warn('Strava upload refused', response.status, reason(text));
      await save(admin, userId, sessionId, {
        format: upload.format,
        status: 'failed',
        error: `${code}: ${reason(text)}`.slice(0, 500),
      });
      return json({ error: code, detail: reason(text) }, 422);
    }
    const data = JSON.parse(text) as { id?: number | string; activity_id?: number | null } & {
      id_str?: string;
    };
    if (upload.format === 'plain') {
      const activityId = data.id !== undefined ? String(data.id) : null;
      await save(admin, userId, sessionId, {
        format: 'plain',
        status: 'posted',
        strava_activity_id: activityId,
        error: null,
      });
      return json({ status: 'posted', activityId });
    }
    await save(admin, userId, sessionId, {
      format: 'structured',
      status: 'processing',
      upload_id: data.id_str ?? (data.id !== undefined ? String(data.id) : null),
      strava_activity_id: null,
      error: null,
    });
    return json({ status: 'processing', activityId: null });
  });
}

/** "… duplicate of activity 21234316" → the existing activity (already on Strava). */
function duplicateOf(error: string): string | null {
  return /duplicate of activity (\d+)/i.exec(error)?.[1] ?? null;
}

function status(req: Request): Promise<Response> {
  return forUser(req, async (admin, userId, integration, body) => {
    const sessionId = body.sessionId as string;
    const { data: row } = await admin
      .from('strava_uploads')
      .select('status, upload_id, strava_activity_id, error')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .maybeSingle();
    if (!row) return json({ error: 'not_found' }, 404);
    if (row.status !== 'processing' || !row.upload_id) {
      return json({
        status: row.status,
        activityId: row.strava_activity_id ?? null,
        error: row.error ?? null,
      });
    }
    const token = await accessToken(admin, integration);
    const response = await fetch(`${API}/uploads/${encodeURIComponent(row.upload_id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 429) throw new StravaError(429, 'rate limited');
    if (response.status === 401) throw new StravaError(401, 'unauthorized');
    if (!response.ok) return json({ status: 'processing', activityId: null });
    const data = (await response.json()) as UploadStatus;
    if (data.activity_id) {
      const activityId = String(data.activity_id);
      await save(admin, userId, sessionId, {
        status: 'posted',
        strava_activity_id: activityId,
        error: null,
      });
      return json({ status: 'posted', activityId });
    }
    if (data.error) {
      const duplicate = duplicateOf(data.error);
      if (duplicate) {
        // Posted before (e.g. the answer was lost): the session is on Strava already.
        await save(admin, userId, sessionId, {
          status: 'posted',
          strava_activity_id: duplicate,
          error: null,
        });
        return json({ status: 'posted', activityId: duplicate });
      }
      const message = `upload_failed: ${reason(data.error)}`.slice(0, 500);
      await save(admin, userId, sessionId, { status: 'failed', error: message });
      return json({ status: 'failed', activityId: null, error: message });
    }
    return json({ status: 'processing', activityId: null });
  });
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname;
  try {
    if (req.method === 'POST' && path.endsWith('/strava-upload/post')) return await post(req);
    if (req.method === 'POST' && path.endsWith('/strava-upload/status')) return await status(req);
    return json({ error: 'not_found' }, 404);
  } catch (error) {
    console.error('strava-upload failed', error);
    return json({ error: 'internal' }, 500);
  }
});
