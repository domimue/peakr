import { eq } from 'drizzle-orm';

import type { Access, CachedAddon } from '../../features/billing/model';

import { db } from '../db/client';
import { appSettings } from '../db/schema';
import { supabase } from '../supabase';

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

const ADDON_KEY = 'billing_body_addon';

/** Same for the Body add-on: the last level the store reported (never more than that). */
export async function getCachedAddon(): Promise<CachedAddon | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, ADDON_KEY) });
  const value = row?.value;
  return value === 'active' || value === 'expired' || value === 'locked' ? value : null;
}

export async function saveCachedAddon(addon: CachedAddon): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: ADDON_KEY, value: addon })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: addon } });
}

/**
 * Whether this account already had its Body trial (server table `addon_trials`, written by the
 * RevenueCat webhook). Null when unknown: signed out, offline or no Supabase project.
 */
export async function bodyTrialUsed(userId: string | null): Promise<boolean | null> {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('addon_trials')
    .select('addon')
    .eq('user_id', userId)
    .eq('addon', 'body_nutrition')
    .maybeSingle();
  if (error) return null;
  return data !== null;
}
