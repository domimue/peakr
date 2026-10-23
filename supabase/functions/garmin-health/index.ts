/**
 * Garmin health data (CLAUDE.md "Health"): connection, consent per data group, sync, listing for
 * the app and deletion. The app never sees a Garmin credential and never knows which credential
 * mode is in use – it only reads `delivery` (push/pull) and how far back the data goes.
 *
 *   GET  /garmin-health/status           (user JWT) → { connection, groups, sync, offers }
 *   POST /garmin-health/connect-key      (user JWT, { apiKey }) → { ok }      [GARMIN_PERSONAL_KEY]
 *        Validates the personal API key by exchanging it for a token, stores both encrypted.
 *   POST /garmin-health/disconnect-key   (user JWT) → { ok }   Removes the key and all health data.
 *   POST /garmin-health/consent          (user JWT, { groups: { sleep: true, … } }) → { groups }
 *        Switching a group off deletes its stored values.
 *   POST /garmin-health/sync             (user JWT) → { stored, sync }   "Sync now" (pull tier).
 *   POST /garmin-health/cron             (x-cron-secret) → { users, stored, failed }   Every 2 h.
 *   GET  /garmin-health/list?since=…     (user JWT) → { rows, cursor, more }   Decrypted values.
 *   POST /garmin-health/delete           (user JWT) → { ok }   All health data, account stays.
 *   GET  /garmin-health/probe?date=…     (user JWT) → raw Garmin responses [GARMIN_PERSONAL_KEY]
 *        Developer aid to check the field names against a real account.
 *
 * Push notifications of the OAuth tier arrive at `watch-webhook/garmin-health/<type>`.
 * `verify_jwt = false` because the cron call carries a secret; user routes check the JWT.
 * Errors never include a key, a token or Garmin's response body.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createGarminPersonalHealthApi,
  mintPersonalToken,
} from '../_shared/health/garmin-personal.ts';
import {
  DELIVERY,
  HEALTH_GROUPS,
  isHealthGroup,
  onlyEnabled,
  type HealthGroup,
} from '../_shared/health/model.ts';
import { createGarminHealthProvider } from '../_shared/health/provider.ts';
import { addDays, afterBackfill, planPull } from '../_shared/health/schedule.ts';
import {
  deleteHealthData,
  enabledGroups,
  garminIntegration,
  listHealthRows,
  loadPersonalCredentials,
  markIntegration,
  personalKeyIntegrations,
  saveBearerToken,
  savePersonalKey,
  setConsents,
  storeHealthRecords,
  syncState,
  updateSyncState,
  type HealthIntegration,
} from '../_shared/health/store.ts';
import { adminClient, json, userFromRequest } from '../_shared/supabase.ts';
import { flagEnabled } from '../_shared/watch/flags.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const env = (name: string) => Deno.env.get(name);
const today = () => new Date().toISOString().slice(0, 10);
/** Garmin calls one cron run may spend in total (no published rate limit – stay modest). */
const CRON_CALL_BUDGET = 400;
const LIST_PAGE = 1000;

type Admin = SupabaseClient;

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function withUser(req: Request, run: (admin: Admin, userId: string) => Promise<Response>) {
  const admin = adminClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);
  return run(admin, user.id);
}

function syncView(state: Awaited<ReturnType<typeof syncState>>) {
  return {
    earliestDay: state?.earliest_day ?? null,
    backfillDone: state?.backfill_done ?? false,
    lastPulledAt: state?.last_pulled_at ?? null,
    lastError: state?.last_error ?? null,
  };
}

/** Health only counts as connected when the connection can deliver health data. */
function healthCapable(i: HealthIntegration | null): i is HealthIntegration {
  if (!i || i.status === 'revoked') return false;
  return i.credential_mode === 'personal_key' || flagEnabled(env, 'garminHealth');
}

async function status(admin: Admin, userId: string): Promise<Response> {
  const integration = await garminIntegration(admin, userId);
  const capable = healthCapable(integration);
  return json({
    connection: capable
      ? {
          status: integration.status,
          delivery: DELIVERY[integration.credential_mode].delivery,
          backfillDays: DELIVERY[integration.credential_mode].backfillDays,
          provides: DELIVERY[integration.credential_mode].provides,
          // Shown to developers only, so they know which path they are testing.
          developerKey: integration.credential_mode === 'personal_key',
        }
      : null,
    groups: [...(await enabledGroups(admin, userId))],
    sync: syncView(await syncState(admin, userId)),
    offers: {
      oauth: flagEnabled(env, 'garminHealth'),
      personalKey: flagEnabled(env, 'garminPersonalKey'),
    },
  });
}

/** One pull for one personal-key connection: recent days, then one backfill step. */
async function pullFor(
  admin: Admin,
  integration: HealthIntegration,
  manual: boolean,
): Promise<{ stored: number; calls: number; failed: boolean }> {
  const userId = integration.user_id;
  const groups = await enabledGroups(admin, userId);
  if (groups.size === 0) return { stored: 0, calls: 0, failed: false };
  const creds = await loadPersonalCredentials(admin, integration);
  const provider = createGarminHealthProvider({ mode: 'personal_key', ...creds }, { fetch });
  const state = await syncState(admin, userId);
  const day = today();
  const plan = planPull({
    today: day,
    manual,
    backfillDays: provider.delivery.backfillDays,
    state,
  });

  let stored = 0;
  let calls = 0;
  const run = async ([from, to]: [string, string]) => {
    const r = await provider.pull(groups, from, to);
    calls += r.calls;
    if (!r.ok) return r;
    const records = onlyEnabled(r.records, groups);
    stored += await storeHealthRecords(admin, userId, records);
    return { ok: true as const, found: records.length };
  };

  const recent = await run(plan.recent);
  let failure = recent.ok ? null : recent.failure;
  if (!failure && plan.backfill) {
    const step = await run(plan.backfill);
    if (step.ok) {
      const earliestDay = (await syncState(admin, userId))?.earliest_day ?? null;
      await updateSyncState(
        admin,
        userId,
        afterBackfill(plan.backfill, step.found, {
          today: day,
          backfillDays: provider.delivery.backfillDays,
          earliestDay,
        }),
      );
    } else failure = step.failure;
  }

  const token = provider.currentToken();
  if (token && token.accessToken !== creds.token?.accessToken)
    await saveBearerToken(admin, integration, token);
  if (failure === 'not_connected') await markIntegration(admin, integration, 'expired');
  await updateSyncState(admin, userId, {
    last_pulled_at: new Date().toISOString(),
    last_error: failure,
  });
  return { stored, calls, failed: failure !== null };
}

async function connectKey(req: Request): Promise<Response> {
  if (!flagEnabled(env, 'garminPersonalKey')) return json({ error: 'not_available' }, 404);
  return withUser(req, async (admin, userId) => {
    const apiKey = (await readJson(req)).apiKey;
    if (typeof apiKey !== 'string' || apiKey.trim().length < 16 || apiKey.length > 4096) {
      return json({ error: 'invalid_key' }, 400);
    }
    const existing = await garminIntegration(admin, userId);
    if (existing && existing.credential_mode === 'oauth' && existing.status === 'active') {
      return json({ error: 'already_connected' }, 409);
    }
    const minted = await mintPersonalToken(fetch, apiKey);
    if (!minted.ok)
      return json({ error: minted.reason }, minted.reason === 'invalid_key' ? 400 : 502);
    const integration = await savePersonalKey(admin, userId, apiKey, minted.token);
    // A new key starts its backfill from scratch.
    await updateSyncState(admin, userId, {
      backfill_before: null,
      backfill_done: false,
      last_error: null,
    });
    EdgeRuntime.waitUntil(
      pullFor(admin, integration, true).catch((e) =>
        console.warn('initial health pull failed', String(e)),
      ),
    );
    return json({ ok: true });
  });
}

async function disconnectKey(req: Request): Promise<Response> {
  return withUser(req, async (admin, userId) => {
    const integration = await garminIntegration(admin, userId);
    if (integration?.credential_mode === 'personal_key') {
      // Tokens cascade with the integration row.
      await admin.from('integrations').delete().eq('id', integration.id);
    }
    await deleteHealthData(admin, userId);
    return json({ ok: true });
  });
}

async function consent(req: Request): Promise<Response> {
  return withUser(req, async (admin, userId) => {
    const raw = (await readJson(req)).groups;
    if (!raw || typeof raw !== 'object') return json({ error: 'invalid_groups' }, 400);
    const groups: Partial<Record<HealthGroup, boolean>> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (isHealthGroup(k) && typeof v === 'boolean') groups[k] = v;
    }
    const before = await enabledGroups(admin, userId);
    const after = await setConsents(admin, userId, groups);
    const added = [...after].some((g) => !before.has(g));
    const integration = await garminIntegration(admin, userId);
    if (
      added &&
      integration?.credential_mode === 'personal_key' &&
      integration.status === 'active'
    ) {
      // A newly enabled group needs its history too: run the backfill again (writes are idempotent).
      await updateSyncState(admin, userId, { backfill_before: null, backfill_done: false });
      EdgeRuntime.waitUntil(
        pullFor(admin, integration, true).catch((e) =>
          console.warn('health pull failed', String(e)),
        ),
      );
    }
    return json({ groups: HEALTH_GROUPS.filter((g) => after.has(g)) });
  });
}

async function syncNow(req: Request): Promise<Response> {
  return withUser(req, async (admin, userId) => {
    const integration = await garminIntegration(admin, userId);
    if (!healthCapable(integration)) return json({ error: 'not_connected' }, 404);
    // Push tier: nothing to pull, the data arrives by itself.
    if (integration.credential_mode !== 'personal_key') {
      return json({ stored: 0, sync: syncView(await syncState(admin, userId)) });
    }
    const r = await pullFor(admin, integration, true);
    return json({ stored: r.stored, sync: syncView(await syncState(admin, userId)) });
  });
}

async function cron(req: Request): Promise<Response> {
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret)
    return json({ error: 'unauthorized' }, 401);
  const admin = adminClient();
  let calls = 0;
  let stored = 0;
  let failed = 0;
  const users = await personalKeyIntegrations(admin);
  for (const integration of users) {
    if (calls >= CRON_CALL_BUDGET) break;
    try {
      const r = await pullFor(admin, integration, false);
      calls += r.calls;
      stored += r.stored;
      if (r.failed) failed++;
    } catch (e) {
      failed++;
      console.warn('health cron pull failed', String(e));
    }
  }
  return json({ users: users.length, stored, failed });
}

async function list(req: Request): Promise<Response> {
  return withUser(req, async (admin, userId) => {
    const since = new URL(req.url).searchParams.get('since');
    if (since && Number.isNaN(Date.parse(since))) return json({ error: 'invalid_cursor' }, 400);
    const rows = await listHealthRows(admin, userId, since, LIST_PAGE);
    return json({
      rows,
      cursor: rows.at(-1)?.serverUpdatedAt ?? since,
      more: rows.length === LIST_PAGE,
    });
  });
}

async function remove(req: Request): Promise<Response> {
  return withUser(req, async (admin, userId) => {
    await deleteHealthData(admin, userId);
    return json({ ok: true });
  });
}

async function probe(req: Request): Promise<Response> {
  if (!flagEnabled(env, 'garminPersonalKey')) return json({ error: 'not_available' }, 404);
  return withUser(req, async (admin, userId) => {
    const integration = await garminIntegration(admin, userId);
    if (integration?.credential_mode !== 'personal_key')
      return json({ error: 'not_connected' }, 404);
    const date = new URL(req.url).searchParams.get('date') ?? addDays(today(), -1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'invalid_date' }, 400);
    const creds = await loadPersonalCredentials(admin, integration);
    if (!creds.apiKey) return json({ error: 'not_connected' }, 404);
    const minted = await mintPersonalToken(fetch, creds.apiKey);
    if (!minted.ok) return json({ error: minted.reason }, 502);
    return json(
      await createGarminPersonalHealthApi({ fetch, accessToken: minted.token.accessToken }).probe(
        date,
      ),
    );
  });
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname;
  const is = (method: string, suffix: string) =>
    req.method === method && path.endsWith(`/garmin-health${suffix}`);
  try {
    if (is('GET', '/status')) return await withUser(req, status);
    if (is('POST', '/connect-key')) return await connectKey(req);
    if (is('POST', '/disconnect-key')) return await disconnectKey(req);
    if (is('POST', '/consent')) return await consent(req);
    if (is('POST', '/sync')) return await syncNow(req);
    if (is('POST', '/cron')) return await cron(req);
    if (is('GET', '/list')) return await list(req);
    if (is('POST', '/delete')) return await remove(req);
    if (is('GET', '/probe')) return await probe(req);
    return json({ error: 'not_found' }, 404);
  } catch (error) {
    console.error('garmin-health failed', String(error));
    return json({ error: 'internal' }, 500);
  }
});
