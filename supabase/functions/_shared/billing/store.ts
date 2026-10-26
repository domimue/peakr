import type { SupabaseClient } from '@supabase/supabase-js';

import { addonTrialsOf, rowsFromSubscriber, type SubscriberResponse } from './revenuecat.ts';

/**
 * RevenueCat REST API (v1) with the secret key REVENUECAT_SECRET_KEY, and the `entitlements`
 * table. Never logs the key or a subscriber's attributes.
 */

const API = 'https://api.revenuecat.com/v1/subscribers';

function secretKey(): string {
  const key = Deno.env.get('REVENUECAT_SECRET_KEY');
  if (!key) throw new Error('Missing REVENUECAT_SECRET_KEY');
  return key;
}

export async function fetchSubscriber(userId: string): Promise<SubscriberResponse> {
  const response = await fetch(`${API}/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${secretKey()}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`RevenueCat subscriber lookup failed: ${response.status}`);
  return (await response.json()) as SubscriberResponse;
}

/** Replaces the stored entitlements of one user with what RevenueCat reports now. */
export async function refreshUser(admin: SupabaseClient, userId: string): Promise<number> {
  const rows = rowsFromSubscriber(userId, await fetchSubscriber(userId));
  const { error: deleteError } = await admin.from('entitlements').delete().eq('user_id', userId);
  if (deleteError) throw deleteError;
  if (rows.length === 0) return 0;
  const { error } = await admin
    .from('entitlements')
    .insert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
  if (error) throw error;
  // Add-on trials are once per account: the first one is remembered, later events change nothing.
  const trials = addonTrialsOf(rows);
  if (trials.length > 0) {
    const { error: trialError } = await admin
      .from('addon_trials')
      .upsert(trials, { onConflict: 'user_id,addon', ignoreDuplicates: true });
    if (trialError) throw trialError;
  }
  return rows.length;
}

/** Account deletion: removes the customer at RevenueCat (best effort, subscriptions stay in the store). */
export async function deleteSubscriber(userId: string): Promise<void> {
  if (!Deno.env.get('REVENUECAT_SECRET_KEY')) return;
  const response = await fetch(`${API}/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  if (!response.ok && response.status !== 404) {
    console.warn('RevenueCat subscriber deletion failed', response.status);
  }
}
