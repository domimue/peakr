import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Peakr's own uploads (gym sessions posted to Strava) must not come back through the webhook,
 * "sync now" or the nightly catch-up as imported activities – the detailed session already exists
 * on the device. Three independent signals, because the webhook can arrive before the upload has
 * been polled to completion:
 *   1. the activity id is recorded in `strava_uploads`,
 *   2. the upload's `external_id` starts with `peakr-gym-` (structured uploads), or
 *   3. the description ends with the marker below (plain posts, which have no external id).
 */

export const OWN_EXTERNAL_PREFIX = 'peakr-gym-';
export const OWN_DESCRIPTION_MARKER = 'Posted with Peakr';

export interface OwnUploadFields {
  id: number | string;
  external_id?: string | null;
  description?: string | null;
}

export function looksLikeOwnUpload(a: OwnUploadFields): boolean {
  return (
    (a.external_id ?? '').startsWith(OWN_EXTERNAL_PREFIX) ||
    (a.description ?? '').trimEnd().endsWith(OWN_DESCRIPTION_MARKER)
  );
}

/** Strava activity ids of the user's recorded uploads (any of `ids`). */
export async function recordedUploadIds(
  admin: SupabaseClient,
  userId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await admin
    .from('strava_uploads')
    .select('strava_activity_id')
    .eq('user_id', userId)
    .in('strava_activity_id', ids as string[]);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.strava_activity_id as string));
}

/**
 * True for an activity Peakr uploaded itself. Remembers the id on the matching upload row (when
 * the signal was the external id) so later events are recognised by id alone.
 */
export async function isOwnUpload(
  admin: SupabaseClient,
  userId: string,
  activity: OwnUploadFields,
): Promise<boolean> {
  const id = String(activity.id);
  if ((await recordedUploadIds(admin, userId, [id])).has(id)) return true;
  if (!looksLikeOwnUpload(activity)) return false;
  const external = activity.external_id ?? '';
  if (external.startsWith(OWN_EXTERNAL_PREFIX)) {
    const sessionId = external.slice(OWN_EXTERNAL_PREFIX.length).replace(/\.json$/i, '');
    await admin
      .from('strava_uploads')
      .update({ strava_activity_id: id })
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .is('strava_activity_id', null);
  }
  return true;
}
