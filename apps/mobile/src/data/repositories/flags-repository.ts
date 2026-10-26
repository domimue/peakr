import { eq } from 'drizzle-orm';

import { parseRemoteFlags, type RemoteFlags } from '../../config/remote-flags';
import { db } from '../db/client';
import { appSettings } from '../db/schema';
import { supabase } from '../supabase';

/** Remote feature flags: the server's table and the copy on this device. */

const KEY = 'remote_flags';

export async function fetchFlags(): Promise<Partial<RemoteFlags> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('feature_flags').select('key, enabled');
  if (error) return null;
  return parseRemoteFlags(data);
}

export async function getCachedFlags(): Promise<Partial<RemoteFlags>> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) });
  if (!row) return {};
  try {
    return parseRemoteFlags(
      Object.entries(JSON.parse(row.value) as Record<string, unknown>).map(([key, enabled]) => ({
        key,
        enabled,
      })),
    );
  } catch {
    return {};
  }
}

export async function saveCachedFlags(flags: Partial<RemoteFlags>): Promise<void> {
  const value = JSON.stringify(flags);
  await db
    .insert(appSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
