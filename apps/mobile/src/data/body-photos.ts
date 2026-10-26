import type { SupabaseClient } from '@supabase/supabase-js';
import { Directory, File, Paths } from 'expo-file-system';

import type { BodyPhoto } from './db/schema';

/**
 * Progress photos (Body check-in). A picked photo is copied into the app's own document folder
 * first, so the check-in works offline and survives the picker's cache being cleared; the sync
 * uploads it to the private bucket `body-photos` under `<user id>/<check-in id>/<slot>.jpg`.
 * Photos are only ever shown through short-lived signed URLs – never a public URL (CLAUDE.md
 * "Energy & body rules").
 */

export const PHOTO_BUCKET = 'body-photos';
export const PHOTO_SLOTS = ['front', 'side', 'back'] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

/** Signed URLs live one hour; the app asks for a new one when it shows the photo again. */
const SIGNED_URL_SECONDS = 60 * 60;

const folder = () => new Directory(Paths.document, 'body-photos');

export const remotePath = (userId: string, checkInId: string, slot: PhotoSlot) =>
  `${userId}/${checkInId}/${slot}.jpg`;

/** Copies a picked image into Peakr's own folder; returns its uri there. */
export function keepLocalCopy(sourceUri: string, checkInId: string, slot: PhotoSlot): string {
  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true });
  const target = new File(dir, `${checkInId}-${slot}-${Date.now()}.jpg`);
  new File(sourceUri).copy(target);
  return target.uri;
}

export function removeLocalCopy(uri: string | null): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn('Removing a local progress photo failed', String(e));
  }
}

/** Uploads a local photo; returns the storage path, or null when it failed (retried next sync). */
export async function uploadPhoto(
  client: SupabaseClient,
  localUri: string,
  path: string,
): Promise<string | null> {
  try {
    const bytes = await new File(localUri).bytes();
    const { error } = await client.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    return error ? null : path;
  } catch (e) {
    console.warn('Uploading a progress photo failed', String(e));
    return null;
  }
}

export async function removeRemotePhotos(
  client: SupabaseClient,
  paths: readonly string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await client.storage.from(PHOTO_BUCKET).remove([...paths]);
  if (error) console.warn('Removing progress photos failed', error.message);
}

/** What to show: the local copy when this device has it, else a signed URL of the upload. */
export async function photoUri(
  client: SupabaseClient | null,
  photo: BodyPhoto | undefined,
): Promise<string | null> {
  if (!photo) return null;
  if (photo.localUri) {
    try {
      if (new File(photo.localUri).exists) return photo.localUri;
    } catch {
      // Fall through to the uploaded copy.
    }
  }
  if (!client || !photo.remotePath) return null;
  const { data, error } = await client.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(photo.remotePath, SIGNED_URL_SECONDS);
  return error ? null : data.signedUrl;
}
