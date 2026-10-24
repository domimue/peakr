/**
 * Account deletion (Profile → Account → Delete account; Google Play and the App Store require it).
 *
 *   POST /delete-account  (Authorization: user JWT)  → { ok: true }
 *
 * 1. Revokes Peakr's access at every connected service (Strava now), best effort – an expired or
 *    already revoked token must not block the deletion.
 * 2. Deletes every row of the user. Most tables cascade from auth.users anyway; deleting them
 *    explicitly first means nothing is left behind if the last step fails and the app retries.
 * 3. Deletes the customer at RevenueCat (best effort), then the auth user with the admin API.
 *
 * Idempotent: every step accepts that its rows are already gone, and a user that no longer exists
 * counts as deleted. Tokens are never logged. A store subscription is not touched – the app tells
 * the user to cancel it in Google Play / the App Store. A subscription bought on the website is
 * cancelled here (before its rows go), because without the account nobody could reach the Stripe
 * customer portal any more.
 */

import { deleteSubscriber } from '../_shared/billing/store.ts';
import { cancelStripeSubscription } from '../_shared/billing/stripe.ts';
import { getProvider } from '../_shared/providers.ts';
import { accessToken, type StravaIntegration } from '../_shared/strava.ts';
import { adminClient, json, userFromRequest } from '../_shared/supabase.ts';

type Admin = ReturnType<typeof adminClient>;

/** Child tables before their parents; `profiles` is keyed by `id`, all others by `user_id`. */
const USER_TABLES = [
  'quiz_sessions',
  'web_checkouts',
  'health_daily',
  'health_sync_state',
  'health_consents',
  'baseline_activities',
  'baseline_imports',
  'activity_streams',
  'strava_routes',
  'activities',
  'workouts',
  'plans',
  'routes',
  'push_tokens',
  'trial_reminders',
  'entitlements',
] as const;

async function revokeIntegrations(admin: Admin, userId: string): Promise<void> {
  const { data, error } = await admin
    .from('integrations')
    .select(
      'id, user_id, provider, external_user_id, expires_at, last_synced_at, status, credential_mode',
    )
    .eq('user_id', userId);
  if (error) throw error;
  for (const row of data ?? []) {
    const provider = getProvider(row.provider as string);
    // A Garmin personal API key has nothing to revoke at Garmin (the user deletes the key there);
    // removing it here is all that can be done.
    if (!provider || row.credential_mode === 'personal_key') continue;
    try {
      // Refreshes an expired Strava token first, so the deauthorisation still reaches Strava.
      await provider.revoke(await accessToken(admin, row as StravaIntegration));
    } catch (e) {
      // The error text can contain the provider's response, never log it.
      const status = (e as { status?: number }).status;
      console.warn('Revoke failed during account deletion', row.provider, status ?? 'unknown');
    }
  }
}

/** Website subscriptions of the user; a failure stops the deletion so the retry cancels them. */
async function cancelWebSubscriptions(admin: Admin, userId: string): Promise<void> {
  const { data, error } = await admin
    .from('web_checkouts')
    .select('subscription_id')
    .eq('user_id', userId)
    .not('subscription_id', 'is', null);
  if (error) throw error;
  for (const id of new Set((data ?? []).map((r) => r.subscription_id as string))) {
    await cancelStripeSubscription(id);
  }
}

async function deleteRows(admin: Admin, userId: string): Promise<void> {
  for (const table of USER_TABLES) {
    const { error } = await admin.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`Deleting ${table} failed: ${error.message}`);
  }
  // Tokens cascade from their integration; deleted explicitly so no token survives a partial run.
  const { data: integrations, error: listError } = await admin
    .from('integrations')
    .select('id')
    .eq('user_id', userId);
  if (listError) throw listError;
  const ids = (integrations ?? []).map((i) => i.id as string);
  if (ids.length > 0) {
    const { error } = await admin.from('integration_tokens').delete().in('integration_id', ids);
    if (error) throw new Error(`Deleting integration_tokens failed: ${error.message}`);
  }
  const { error: integrationError } = await admin
    .from('integrations')
    .delete()
    .eq('user_id', userId);
  if (integrationError)
    throw new Error(`Deleting integrations failed: ${integrationError.message}`);
  const { error: profileError } = await admin.from('profiles').delete().eq('id', userId);
  if (profileError) throw new Error(`Deleting profiles failed: ${profileError.message}`);
}

async function deleteAuthUser(admin: Admin, userId: string): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && error.status !== 404) throw new Error(`Deleting auth user failed: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'not_found' }, 404);
  try {
    const admin = adminClient();
    const user = await userFromRequest(req, admin);
    if (!user) return json({ error: 'unauthorized' }, 401);
    await revokeIntegrations(admin, user.id);
    await cancelWebSubscriptions(admin, user.id);
    await deleteRows(admin, user.id);
    // The RevenueCat customer (purchase history keyed by this id); the store subscription itself
    // is cancelled by the user in the store.
    await deleteSubscriber(user.id);
    await deleteAuthUser(admin, user.id);
    console.log('Account deleted', user.id);
    return json({ ok: true });
  } catch (error) {
    console.error('delete-account failed', String(error));
    return json({ error: 'internal' }, 500);
  }
});
