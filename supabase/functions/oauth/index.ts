/**
 * OAuth with third-party services (skeleton; Strava first). Secrets and the token exchange stay
 * here – the app never sees a client secret or a provider token.
 *
 *   POST /oauth/start       { provider }  (Authorization: user JWT)  → { url }
 *        The app opens `url` in an auth browser session.
 *   GET  /oauth/callback    ?code&state&scope  (called by the provider's redirect)
 *        Verifies the signed state, exchanges the code, stores the encrypted tokens and the
 *        integration metadata, then redirects to the app: peakr://integrations/<provider>?status=…
 *        Strava: the last 14 days of activities are imported right away, so the plan adapts at once.
 *   POST /oauth/disconnect  { provider }  (Authorization: user JWT)  → { ok }
 *        Revokes access at the provider and removes tokens and metadata (Strava: and every
 *        imported activity).
 *
 * `verify_jwt = false` in supabase/config.toml because the provider calls /callback without a
 * Supabase JWT; /start and /disconnect check the JWT themselves.
 */

import { decryptToken, encryptToken, signState, verifyState } from '../_shared/crypto.ts';
import { getProvider, type TokenSet } from '../_shared/providers.ts';
import { importSince, integrationForUser, removeStravaData } from '../_shared/strava.ts';
import { adminClient, json, userFromRequest } from '../_shared/supabase.ts';

const BACKFILL_MS = 14 * 86_400_000;

const APP_REDIRECT = Deno.env.get('APP_OAUTH_REDIRECT') ?? 'peakr://integrations';

function callbackUrl(): string {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth/callback`;
}

function backToApp(provider: string, status: 'connected' | 'denied' | 'error'): Response {
  return Response.redirect(`${APP_REDIRECT}/${encodeURIComponent(provider)}?status=${status}`, 302);
}

async function readProvider(req: Request): Promise<string | null> {
  try {
    const body = (await req.json()) as { provider?: unknown };
    return typeof body.provider === 'string' ? body.provider : null;
  } catch {
    return null;
  }
}

async function start(req: Request): Promise<Response> {
  const admin = adminClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const provider = getProvider((await readProvider(req)) ?? '');
  if (!provider) return json({ error: 'unknown_provider' }, 400);
  const state = await signState(user.id, provider.id);
  return json({ url: provider.authorizeUrl({ redirectUri: callbackUrl(), state }) });
}

async function storeTokens(
  userId: string,
  providerId: string,
  tokens: TokenSet,
  scopes: string[],
): Promise<void> {
  const admin = adminClient();
  const { data, error } = await admin
    .from('integrations')
    .upsert(
      {
        user_id: userId,
        provider: providerId,
        external_user_id: tokens.externalUserId,
        scopes,
        status: 'active',
        expires_at: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    )
    .select('id')
    .single();
  if (error) throw error;
  const { error: tokenError } = await admin.from('integration_tokens').upsert({
    integration_id: data.id,
    access_token: await encryptToken(tokens.accessToken),
    refresh_token: tokens.refreshToken ? await encryptToken(tokens.refreshToken) : null,
  });
  if (tokenError) throw tokenError;
}

/** Recent activities right after connecting; a failure here must not fail the connection. */
async function backfillStrava(userId: string): Promise<void> {
  const admin = adminClient();
  try {
    const integration = await integrationForUser(admin, userId);
    if (integration) await importSince(admin, integration, Date.now() - BACKFILL_MS, 1);
  } catch (error) {
    console.warn('Strava backfill failed', String(error));
  }
}

async function callback(req: Request): Promise<Response> {
  const query = new URL(req.url).searchParams;
  const state = await verifyState(query.get('state') ?? '');
  // Without a valid state we do not know the user – nothing is stored.
  if (!state) return backToApp('unknown', 'error');
  const provider = getProvider(state.provider);
  if (!provider) return backToApp(state.provider, 'error');
  const code = query.get('code');
  if (query.get('error') || !code) return backToApp(provider.id, 'denied');
  try {
    const tokens = await provider.exchangeCode({ code, redirectUri: callbackUrl() });
    const scopes = provider.grantedScopes(query);
    // The athlete can untick activity access on Strava's consent screen; without it there is
    // nothing to sync. (activity:read alone works but misses private activities.)
    const activityScope = scopes.includes('activity:read_all') || scopes.includes('activity:read');
    if (provider.id === 'strava' && !activityScope) {
      await provider.revoke(tokens.accessToken).catch(() => undefined);
      return backToApp(provider.id, 'denied');
    }
    await storeTokens(state.userId, provider.id, tokens, scopes);
    if (provider.id === 'strava') await backfillStrava(state.userId);
    return backToApp(provider.id, 'connected');
  } catch (error) {
    console.error('OAuth exchange failed', provider.id, error);
    return backToApp(provider.id, 'error');
  }
}

async function disconnect(req: Request): Promise<Response> {
  const admin = adminClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const provider = getProvider((await readProvider(req)) ?? '');
  if (!provider) return json({ error: 'unknown_provider' }, 400);
  const { data: integration } = await admin
    .from('integrations')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider', provider.id)
    .maybeSingle();
  if (!integration) return json({ ok: true });
  const { data: tokens } = await admin
    .from('integration_tokens')
    .select('access_token')
    .eq('integration_id', integration.id)
    .maybeSingle();
  if (tokens) {
    try {
      await provider.revoke(await decryptToken(tokens.access_token));
    } catch (error) {
      // An expired token cannot be revoked; removing it on our side is what matters.
      console.warn('Revoke failed', provider.id, error);
    }
  }
  if (provider.id === 'strava') {
    await removeStravaData(admin, user.id);
    return json({ ok: true });
  }
  const { error } = await admin.from('integrations').delete().eq('id', integration.id);
  if (error) return json({ error: 'delete_failed' }, 500);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname;
  try {
    if (req.method === 'POST' && path.endsWith('/oauth/start')) return await start(req);
    if (req.method === 'GET' && path.endsWith('/oauth/callback')) return await callback(req);
    if (req.method === 'POST' && path.endsWith('/oauth/disconnect')) return await disconnect(req);
    return json({ error: 'not_found' }, 404);
  } catch (error) {
    console.error('oauth function failed', error);
    return json({ error: 'internal' }, 500);
  }
});
