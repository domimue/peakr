import { eq } from 'drizzle-orm';

import type { Access } from '../../features/billing/model';

import { db } from '../db/client';
import { appSettings } from '../db/schema';

/**
 * The last access level the store reported on this device. Only used when the RevenueCat SDK
 * cannot answer at start-up (it normally serves its own cache offline), so a subscriber in a gym
 * without reception is not shown the paywall. Never grants more than the store did last time.
 */

const ACCESS_KEY = 'billing_access';

export async function getCachedAccess(): Promise<Access | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, ACCESS_KEY) });
  const value = row?.value;
  return value === 'full' || value === 'readOnly' || value === 'preview' ? value : null;
}

export async function saveCachedAccess(access: Access): Promise<void> {
  if (access === 'pending') return;
  await db
    .insert(appSettings)
    .values({ key: ACCESS_KEY, value: access })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: access } });
}
