import type { SupabaseClient } from '@supabase/supabase-js';

import { decryptHealth, decryptToken, encryptHealth, encryptToken } from '../crypto.ts';
import type { BearerToken, EndpointStats } from './garmin-personal.ts';
import {
  HEALTH_GROUPS,
  isHealthGroup,
  METRIC_GROUP,
  type CredentialMode,
  type GarminHealthRecord,
  type HealthGroup,
  type HealthMetric,
} from './model.ts';

/**
 * Database side of the health data (service role only). Values are encrypted before they are
 * written and decrypted only for the user they belong to (`listHealthRows`).
 */

export interface HealthIntegration {
  id: string;
  user_id: string;
  external_user_id: string | null;
  credential_mode: CredentialMode;
  expires_at: string | null;
  status: string;
  /** For Garmin OAuth: the permissions granted on Garmin's consent screen. */
  scopes: string[];
}

const COLUMNS = 'id, user_id, external_user_id, credential_mode, expires_at, status, scopes';

export async function garminIntegration(
  admin: SupabaseClient,
  userId: string,
): Promise<HealthIntegration | null> {
  const { data, error } = await admin
    .from('integrations')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('provider', 'garmin')
    .maybeSingle();
  if (error) throw error;
  return data as HealthIntegration | null;
}

export async function garminIntegrationByExternal(
  admin: SupabaseClient,
  garminUserId: string,
): Promise<HealthIntegration | null> {
  const { data, error } = await admin
    .from('integrations')
    .select(COLUMNS)
    .eq('provider', 'garmin')
    .eq('external_user_id', garminUserId)
    .maybeSingle();
  if (error) throw error;
  return data as HealthIntegration | null;
}

/** Every active personal-key connection (the scheduled pull). */
export async function personalKeyIntegrations(admin: SupabaseClient): Promise<HealthIntegration[]> {
  const { data, error } = await admin
    .from('integrations')
    .select(COLUMNS)
    .eq('provider', 'garmin')
    .eq('credential_mode', 'personal_key')
    .eq('status', 'active');
  if (error) throw error;
  return (data ?? []) as HealthIntegration[];
}

// ---------------------------------------------------------------------------------------------
// Personal key credentials: the key lives encrypted in `integration_tokens.refresh_token` (it
// plays the refresh token's role), the current bearer token in `access_token`.

export async function savePersonalKey(
  admin: SupabaseClient,
  userId: string,
  apiKey: string,
  token: BearerToken,
): Promise<HealthIntegration> {
  const { data, error } = await admin
    .from('integrations')
    .upsert(
      {
        user_id: userId,
        provider: 'garmin',
        credential_mode: 'personal_key',
        scopes: ['health'],
        status: 'active',
        expires_at: new Date(token.expiresAt).toISOString(),
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    )
    .select(COLUMNS)
    .single();
  if (error) throw error;
  const integration = data as HealthIntegration;
  const { error: tokenError } = await admin.from('integration_tokens').upsert({
    integration_id: integration.id,
    access_token: await encryptToken(token.accessToken),
    refresh_token: await encryptToken(apiKey.trim()),
  });
  if (tokenError) throw tokenError;
  return integration;
}

export async function loadPersonalCredentials(
  admin: SupabaseClient,
  integration: HealthIntegration,
): Promise<{ apiKey: string | null; token: BearerToken | null }> {
  const { data, error } = await admin
    .from('integration_tokens')
    .select('access_token, refresh_token')
    .eq('integration_id', integration.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { apiKey: null, token: null };
  const expiresAt = integration.expires_at ? Date.parse(integration.expires_at) : 0;
  return {
    apiKey: data.refresh_token ? await decryptToken(data.refresh_token) : null,
    token: { accessToken: await decryptToken(data.access_token), expiresAt },
  };
}

export async function saveBearerToken(
  admin: SupabaseClient,
  integration: HealthIntegration,
  token: BearerToken,
): Promise<void> {
  await admin
    .from('integration_tokens')
    .update({ access_token: await encryptToken(token.accessToken) })
    .eq('integration_id', integration.id);
  await admin
    .from('integrations')
    .update({ expires_at: new Date(token.expiresAt).toISOString(), status: 'active' })
    .eq('id', integration.id);
}

/** Garmin OAuth: stores the permissions the user granted (consent screen or a change push). */
export async function saveGarminPermissions(
  admin: SupabaseClient,
  integration: HealthIntegration,
  permissions: readonly string[],
): Promise<void> {
  const { error } = await admin
    .from('integrations')
    .update({ scopes: [...permissions] })
    .eq('id', integration.id);
  if (error) throw error;
}

export async function markIntegration(
  admin: SupabaseClient,
  integration: HealthIntegration,
  status: 'expired' | 'error' | 'revoked',
): Promise<void> {
  await admin.from('integrations').update({ status }).eq('id', integration.id);
}

// ---------------------------------------------------------------------------------------------
// Consents

export async function enabledGroups(
  admin: SupabaseClient,
  userId: string,
): Promise<Set<HealthGroup>> {
  const { data, error } = await admin
    .from('health_consents')
    .select('group, enabled')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set(
    (data ?? [])
      .filter((r) => r.enabled && isHealthGroup(r.group))
      .map((r) => r.group as HealthGroup),
  );
}

/** Saves the switches; switching a group off deletes what Peakr stored for it. */
export async function setConsents(
  admin: SupabaseClient,
  userId: string,
  groups: Partial<Record<HealthGroup, boolean>>,
): Promise<Set<HealthGroup>> {
  const rows = HEALTH_GROUPS.filter((g) => typeof groups[g] === 'boolean').map((g) => ({
    user_id: userId,
    group: g,
    enabled: groups[g] as boolean,
    changed_at: new Date().toISOString(),
  }));
  if (rows.length) {
    const { error } = await admin.from('health_consents').upsert(rows);
    if (error) throw error;
  }
  const off = rows.filter((r) => !r.enabled).map((r) => r.group);
  if (off.length) await deleteHealthData(admin, userId, off);
  return enabledGroups(admin, userId);
}

// ---------------------------------------------------------------------------------------------
// Values

export async function storeHealthRecords(
  admin: SupabaseClient,
  userId: string,
  records: readonly GarminHealthRecord[],
): Promise<number> {
  if (records.length === 0) return 0;
  // One row per metric/day: later records in the batch win, ids are merged.
  const byKey = new Map<string, { r: GarminHealthRecord; ids: Set<string> }>();
  for (const r of records) {
    const key = `${r.metric}|${r.day}`;
    const prev = byKey.get(key);
    const ids = prev?.ids ?? new Set<string>();
    ids.add(r.sourceId);
    byKey.set(key, { r: !prev || r.recordedAt >= prev.r.recordedAt ? r : prev.r, ids });
  }
  const rows = [];
  for (const { r, ids } of byKey.values()) {
    rows.push({
      user_id: userId,
      metric: r.metric,
      day: r.day,
      source: 'garmin',
      source_ids: [...ids],
      recorded_at: r.recordedAt,
      value_enc: await encryptHealth(JSON.stringify({ value: r.value, detail: r.detail ?? null })),
    });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from('health_daily')
      .upsert(rows.slice(i, i + 500), { onConflict: 'user_id,metric,day,source' });
    if (error) throw error;
  }
  const earliest = rows.reduce((min, r) => (r.day < min ? r.day : min), rows[0]?.day as string);
  await noteEarliest(admin, userId, earliest);
  return rows.length;
}

async function noteEarliest(admin: SupabaseClient, userId: string, day: string): Promise<void> {
  const state = await syncState(admin, userId);
  if (state?.earliest_day && state.earliest_day <= day) return;
  await admin
    .from('health_sync_state')
    .upsert(
      { user_id: userId, source: 'garmin', earliest_day: day },
      { onConflict: 'user_id,source' },
    );
}

export interface SyncState {
  earliest_day: string | null;
  backfill_before: string | null;
  backfill_done: boolean;
  last_pulled_at: string | null;
  last_error: string | null;
  parser_version: number;
  endpoints: { recent?: EndpointStats; backfill?: EndpointStats };
  backfill_requested_at: string | null;
}

export async function syncState(admin: SupabaseClient, userId: string): Promise<SyncState | null> {
  const { data, error } = await admin
    .from('health_sync_state')
    .select(
      'earliest_day, backfill_before, backfill_done, last_pulled_at, last_error, parser_version, endpoints, backfill_requested_at',
    )
    .eq('user_id', userId)
    .eq('source', 'garmin')
    .maybeSingle();
  if (error) throw error;
  return data as SyncState | null;
}

export async function updateSyncState(
  admin: SupabaseClient,
  userId: string,
  patch: Partial<SyncState>,
): Promise<void> {
  await admin
    .from('health_sync_state')
    .upsert({ user_id: userId, source: 'garmin', ...patch }, { onConflict: 'user_id,source' });
}

/**
 * Deletes stored health data: of the given groups, or everything (incl. the sync state) when no
 * groups are passed. The account and the connection stay.
 */
export async function deleteHealthData(
  admin: SupabaseClient,
  userId: string,
  groups?: readonly HealthGroup[],
): Promise<void> {
  let query = admin.from('health_daily').delete().eq('user_id', userId);
  if (groups) {
    const metrics = (Object.keys(METRIC_GROUP) as HealthMetric[]).filter((m) =>
      groups.includes(METRIC_GROUP[m]),
    );
    if (metrics.length === 0) return;
    query = query.in('metric', metrics);
  }
  const { error } = await query;
  if (error) throw error;
  if (!groups) await admin.from('health_sync_state').delete().eq('user_id', userId);
}

export interface HealthRow {
  metric: HealthMetric;
  day: string;
  source: 'garmin';
  sourceIds: string[];
  recordedAt: string;
  value: number;
  detail: Record<string, unknown> | null;
  serverUpdatedAt: string;
}

/** Decrypted rows of one user changed after `since` (the app's pull cursor), oldest first. */
export async function listHealthRows(
  admin: SupabaseClient,
  userId: string,
  since: string | null,
  limit = 1000,
): Promise<HealthRow[]> {
  let query = admin
    .from('health_daily')
    .select('metric, day, source, source_ids, recorded_at, value_enc, server_updated_at')
    .eq('user_id', userId)
    .order('server_updated_at', { ascending: true })
    .limit(limit);
  if (since) query = query.gt('server_updated_at', since);
  const { data, error } = await query;
  if (error) throw error;
  const out: HealthRow[] = [];
  for (const r of data ?? []) {
    const plain = JSON.parse(await decryptHealth(r.value_enc as string)) as {
      value: number;
      detail: Record<string, unknown> | null;
    };
    out.push({
      metric: r.metric as HealthMetric,
      day: r.day as string,
      source: 'garmin',
      sourceIds: r.source_ids as string[],
      recordedAt: r.recorded_at as string,
      value: plain.value,
      detail: plain.detail,
      serverUpdatedAt: r.server_updated_at as string,
    });
  }
  return out;
}
