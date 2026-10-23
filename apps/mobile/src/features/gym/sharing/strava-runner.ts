import { MAX_POLLS, pollDelaySec, type ShareState, type StravaUpload } from '@peakr/engine';

import type { StravaPostResult, StravaStatusResult } from './strava-api';

/**
 * Posting one session to Strava: upload, then poll the upload status (asynchronous on Strava's
 * side) with backoff until it returns an activity id. Every step is reported through `report`
 * (posting → posted / failed / needs_scope), so the UI always shows a clear state and a retry.
 */

export interface StravaRunnerDeps {
  post(sessionId: string, upload: StravaUpload): Promise<StravaPostResult>;
  status(sessionId: string): Promise<StravaStatusResult>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

type Report = (state: ShareState) => void;

export function errorText(code: string, detail?: string): string {
  return detail ? `${code}: ${detail}` : code;
}

/** `scope_missing` and the like arrive as the code; Strava's own message follows a colon. */
export function splitError(error: string | undefined): { code: string; detail?: string } {
  if (!error) return { code: 'upload_failed' };
  const at = error.indexOf(':');
  if (at < 0) return { code: error };
  return { code: error.slice(0, at), detail: error.slice(at + 1).trim() };
}

export async function pollStrava(
  sessionId: string,
  format: 'structured' | 'plain',
  report: Report,
  deps: StravaRunnerDeps,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await deps.sleep(pollDelaySec(attempt) * 1000);
    const result = await deps.status(sessionId);
    const at = deps.now();
    if (!result.ok) {
      // Transient (network, rate limit): keep polling; reconnect needs the user.
      if (result.error === 'reconnect') {
        return report({ status: 'failed', format, error: 'reconnect', at });
      }
      continue;
    }
    if (result.status === 'posted') {
      return report({
        status: 'posted',
        format,
        at,
        ...(result.activityId ? { remoteId: result.activityId } : {}),
      });
    }
    if (result.status === 'failed') {
      return report({ status: 'failed', format, error: result.error ?? 'upload_failed', at });
    }
  }
  // Still processing after the last try: the state stays "posting"; opening the session resumes.
  report({ status: 'posting', format, at: deps.now() });
}

export async function postSessionToStrava(
  sessionId: string,
  upload: StravaUpload,
  report: Report,
  deps: StravaRunnerDeps,
): Promise<void> {
  const format = upload.format;
  report({ status: 'posting', format, at: deps.now() });
  const result = await deps.post(sessionId, upload);
  const at = deps.now();
  if (!result.ok) {
    if (result.error === 'scope_missing') return report({ status: 'needs_scope', format, at });
    return report({
      status: 'failed',
      format,
      error: errorText(result.error, result.detail),
      at,
    });
  }
  if (result.status === 'posted') {
    return report({
      status: 'posted',
      format,
      at,
      ...(result.activityId ? { remoteId: result.activityId } : {}),
    });
  }
  await pollStrava(sessionId, format, report, deps);
}
