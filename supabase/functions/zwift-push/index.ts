/**
 * Zwift Training Connections (CLAUDE.md "Zwift", phase 2) – skeleton, disabled until Zwift
 * approves Peakr as a platform.
 *
 *   POST /zwift-push  (Authorization: user JWT)
 *        { workoutId, date, zwo }   → { ok: true, zwiftId }   push or update a scheduled workout
 *   DELETE /zwift-push (Authorization: user JWT)
 *        { workoutId }              → { ok: true }            remove a pushed workout
 *
 * Off unless the secret `ZWIFT_ENABLED` is `true`; answers 503 `disabled` otherwise, so the app can
 * ship the call behind its `zwiftTrainingConnections` flag. The Zwift OAuth flow (provider entry in
 * `_shared/providers.ts`, tokens in `integrations` with provider `zwift`) and the calls to Zwift's
 * API are filled in with the credentials and documentation Zwift sends on approval. Secrets stay
 * here, never in the app; tokens are never logged.
 */

import { adminClient, json, userFromRequest } from '../_shared/supabase.ts';

const MAX_ZWO_BYTES = 64 * 1024;

interface PushBody {
  workoutId: string;
  date: string;
  zwo: string;
}

function parsePush(body: unknown): PushBody | null {
  if (typeof body !== 'object' || body === null) return null;
  const { workoutId, date, zwo } = body as Partial<PushBody>;
  if (typeof workoutId !== 'string' || workoutId === '') return null;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof zwo !== 'string' || !zwo.startsWith('<?xml')) return null;
  if (new TextEncoder().encode(zwo).length >= MAX_ZWO_BYTES) return null;
  return { workoutId, date, zwo };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'DELETE') return json({ error: 'method' }, 405);
  if (Deno.env.get('ZWIFT_ENABLED') !== 'true') return json({ error: 'disabled' }, 503);

  const admin = adminClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body: unknown = await req.json().catch(() => null);

  if (req.method === 'DELETE') {
    const workoutId = (body as { workoutId?: unknown } | null)?.workoutId;
    if (typeof workoutId !== 'string' || workoutId === '') return json({ error: 'body' }, 400);
    // TODO(zwift-approval): delete the scheduled workout at Zwift.
    return json({ error: 'not_implemented' }, 501);
  }

  if (!parsePush(body)) return json({ error: 'body' }, 400);
  const { data: integration } = await admin
    .from('integrations')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider', 'zwift')
    .maybeSingle();
  if (!integration) return json({ error: 'not_connected' }, 409);

  // TODO(zwift-approval): refresh the token, convert the .zwo as Zwift specifies and schedule it.
  return json({ error: 'not_implemented' }, 501);
});
