import type { StravaUpload } from '@peakr/engine';

import { supabase } from '@/data/supabase';

/** Client of the Edge Function `strava-upload` (supabase/functions/strava-upload). */

export type StravaPostError =
  | 'not_connected'
  | 'scope_missing'
  | 'reconnect'
  | 'rate_limited'
  | 'structured_unavailable'
  | 'upload_failed'
  | 'network';

export type StravaPostResult =
  | { ok: true; status: 'processing' | 'posted'; activityId: string | null }
  | { ok: false; error: StravaPostError; detail?: string };

export type StravaStatusResult =
  | {
      ok: true;
      status: 'processing' | 'posted' | 'failed';
      activityId: string | null;
      error?: string;
    }
  | { ok: false; error: StravaPostError };

const KNOWN: readonly StravaPostError[] = [
  'not_connected',
  'scope_missing',
  'reconnect',
  'rate_limited',
  'structured_unavailable',
  'upload_failed',
];

async function errorBody(error: unknown): Promise<{ error?: string; detail?: string }> {
  try {
    const context = (error as { context?: Response } | null)?.context;
    return ((await context?.json()) as { error?: string; detail?: string } | undefined) ?? {};
  } catch {
    return {};
  }
}

async function invoke<T>(path: string, body: object) {
  if (!supabase) return { data: null as T | null, failure: 'network' as StravaPostError };
  const { data, error } = await supabase.functions.invoke<T>(path, { body });
  if (!error) return { data, failure: null, detail: undefined };
  const parsed = await errorBody(error);
  const known = KNOWN.find((k) => k === parsed.error);
  return { data: null as T | null, failure: known ?? 'network', detail: parsed.detail };
}

export async function postToStrava(
  sessionId: string,
  upload: StravaUpload,
): Promise<StravaPostResult> {
  const result = await invoke<{ status: 'processing' | 'posted'; activityId: string | null }>(
    'strava-upload/post',
    { sessionId, upload },
  );
  if (result.failure || !result.data) {
    return {
      ok: false,
      error: result.failure ?? 'network',
      ...(result.detail ? { detail: result.detail } : {}),
    };
  }
  return { ok: true, status: result.data.status, activityId: result.data.activityId };
}

export async function stravaUploadStatus(sessionId: string): Promise<StravaStatusResult> {
  const result = await invoke<{
    status: 'processing' | 'posted' | 'failed';
    activityId: string | null;
    error?: string | null;
  }>('strava-upload/status', { sessionId });
  if (result.failure || !result.data) return { ok: false, error: result.failure ?? 'network' };
  return {
    ok: true,
    status: result.data.status,
    activityId: result.data.activityId,
    ...(result.data.error ? { error: result.data.error } : {}),
  };
}
