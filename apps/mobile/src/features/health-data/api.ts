import type { HealthGroup, HealthMetric } from '@peakr/engine';

import { supabase } from '@/data/supabase';

/**
 * Client of the Edge Function `garmin-health`. The app never holds a Garmin credential and does not
 * know the credential mode; it only learns whether data is pushed or pulled and how far back it
 * goes (CLAUDE.md "Health").
 */

export interface HealthConnection {
  status: 'active' | 'expired' | 'revoked' | 'error';
  delivery: 'push' | 'pull';
  /** Days of history Peakr fetches on connect; 0 = data starts on the connection day. */
  backfillDays: number;
  /** Metrics this connection delivers; everything else is shown as "not provided". */
  provides: HealthMetric[];
  /** Connected with a developer personal API key (shown in developer builds only). */
  developerKey: boolean;
}

export interface HealthSyncInfo {
  earliestDay: string | null;
  backfillDone: boolean;
  lastPulledAt: string | null;
  lastError: string | null;
}

export interface HealthStatus {
  connection: HealthConnection | null;
  groups: HealthGroup[];
  sync: HealthSyncInfo;
  /** What the server can offer right now (Garmin OAuth once approved, the developer key flag). */
  offers: { oauth: boolean; personalKey: boolean };
}

export interface ServerHealthRow {
  metric: HealthMetric;
  day: string;
  source: 'garmin';
  sourceIds: string[];
  recordedAt: string;
  value: number;
  detail: Record<string, unknown> | null;
  serverUpdatedAt: string;
}

export type ConnectKeyError = 'invalid_key' | 'already_connected' | 'unavailable';

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

async function errorCode(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    const body = (await context.json()) as { error?: string };
    return body.error ?? null;
  } catch {
    return null;
  }
}

export async function fetchHealthStatus(): Promise<HealthStatus> {
  const { data, error } = await client().functions.invoke<HealthStatus>('garmin-health/status', {
    method: 'GET',
  });
  if (error || !data) throw new Error('health status unavailable');
  return data;
}

export async function connectPersonalKey(apiKey: string): Promise<ConnectKeyError | null> {
  const { error } = await client().functions.invoke('garmin-health/connect-key', {
    body: { apiKey },
  });
  if (!error) return null;
  const code = await errorCode(error);
  return code === 'invalid_key' || code === 'already_connected' ? code : 'unavailable';
}

export async function disconnectPersonalKey(): Promise<boolean> {
  const { error } = await client().functions.invoke('garmin-health/disconnect-key', { body: {} });
  return !error;
}

export async function saveConsents(
  groups: Partial<Record<HealthGroup, boolean>>,
): Promise<HealthGroup[]> {
  const { data, error } = await client().functions.invoke<{ groups: HealthGroup[] }>(
    'garmin-health/consent',
    { body: { groups } },
  );
  if (error || !data) throw new Error('consent not saved');
  return data.groups;
}

export async function requestHealthSync(): Promise<void> {
  const { error } = await client().functions.invoke('garmin-health/sync', { body: {} });
  if (error) throw new Error('sync failed');
}

export async function deleteServerHealthData(): Promise<boolean> {
  const { error } = await client().functions.invoke('garmin-health/delete', { body: {} });
  return !error;
}

export async function fetchHealthRows(
  since: string | null,
): Promise<{ rows: ServerHealthRow[]; cursor: string | null; more: boolean }> {
  const path = since
    ? `garmin-health/list?since=${encodeURIComponent(since)}`
    : 'garmin-health/list';
  const { data, error } = await client().functions.invoke<{
    rows: ServerHealthRow[];
    cursor: string | null;
    more: boolean;
  }>(path, { method: 'GET' });
  if (error || !data) throw new Error('health list unavailable');
  return data;
}
