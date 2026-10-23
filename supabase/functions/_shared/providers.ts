/**
 * OAuth providers the `oauth` function can connect. Client ids and secrets come only from
 * Supabase secrets (`supabase secrets set …`), never from the app.
 *
 * Garmin, COROS and Suunto are registered here but only offered once their feature flag is on
 * (`WATCH_GARMIN_*`, `WATCH_COROS`, `WATCH_SUUNTO`), i.e. after the partner programme has approved
 * Peakr. Komoot and Zwift follow the same way later. Hevy uses a personal API key instead of
 * OAuth and gets its own function.
 */

import { pkceChallenge, pkceVerifier } from './crypto.ts';
import { COROS, GARMIN, SUUNTO } from './watch/contracts.ts';
import { flagEnabled } from './watch/flags.ts';

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds, or null if the token does not expire. */
  expiresAt: number | null;
  /** The user's id at the provider (e.g. Strava athlete id). */
  externalUserId: string | null;
}

export type ProviderId = 'strava' | 'garmin' | 'coros' | 'suunto';

export interface OAuthProvider {
  id: ProviderId;
  authorizeUrl(params: {
    redirectUri: string;
    state: string;
    forceConsent?: boolean;
  }): string | Promise<string>;
  /** Exchanges the authorization code from the callback for tokens (`state` for PKCE). */
  exchangeCode(params: { code: string; redirectUri: string; state: string }): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  /** Revokes Peakr's access at the provider (disconnect, account deletion). */
  revoke(accessToken: string): Promise<void>;
  /** Scopes granted, read from the callback query (provider-specific). */
  grantedScopes(query: URLSearchParams): string[];
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
}

async function postForm(url: string, body: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number };
}

function stravaTokens(json: unknown): TokenSet {
  const t = json as StravaTokenResponse;
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: t.expires_at * 1000,
    externalUserId: t.athlete ? String(t.athlete.id) : null,
  };
}

/** Strava: activities of all visibilities, read-only (the plan adapts to them). */
const strava: OAuthProvider = {
  id: 'strava',
  authorizeUrl({ redirectUri, state, forceConsent }) {
    const url = new URL('https://www.strava.com/oauth/mobile/authorize');
    url.search = new URLSearchParams({
      client_id: env('STRAVA_CLIENT_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      // `force` re-shows the consent screen, which an existing user needs to add a scope.
      approval_prompt: forceConsent ? 'force' : 'auto',
      // read_all: private routes too (athletes who connected before only get public ones).
      // profile:read_all: the athlete's HR zones for the baseline (plan calibration).
      // activity:write: gym sessions posted to Strava (uploads endpoint); optional for the user –
      // athletes who connected earlier or unticked it are asked when they first post.
      scope: 'read,read_all,activity:read_all,activity:write,profile:read_all',
      state,
    }).toString();
    return url.toString();
  },
  async exchangeCode({ code }) {
    return stravaTokens(
      await postForm('https://www.strava.com/oauth/token', {
        client_id: env('STRAVA_CLIENT_ID'),
        client_secret: env('STRAVA_CLIENT_SECRET'),
        code,
        grant_type: 'authorization_code',
      }),
    );
  },
  async refresh(refreshToken) {
    return stravaTokens(
      await postForm('https://www.strava.com/oauth/token', {
        client_id: env('STRAVA_CLIENT_ID'),
        client_secret: env('STRAVA_CLIENT_SECRET'),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    );
  },
  async revoke(accessToken) {
    await postForm('https://www.strava.com/oauth/deauthorize', { access_token: accessToken });
  },
  grantedScopes(query) {
    return (query.get('scope') ?? '').split(',').filter(Boolean);
  },
};

const expiry = (seconds: unknown): number | null =>
  typeof seconds === 'number' ? Date.now() + seconds * 1000 : null;

async function postFormAuth(
  url: string,
  body: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      ...headers,
    },
    body: new URLSearchParams(body),
  });
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Garmin Connect Developer Program: OAuth 2.0 with PKCE (S256). The verifier is derived from the
 * signed state, so nothing has to be stored between the redirect and the callback.
 * Unverified endpoints: see `GARMIN` in watch/garmin.ts.
 */
const garmin: OAuthProvider = {
  id: 'garmin',
  async authorizeUrl({ redirectUri, state }) {
    const url = new URL(GARMIN.authorizeUrl);
    url.search = new URLSearchParams({
      client_id: env('GARMIN_CLIENT_ID'),
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      code_challenge: await pkceChallenge(state),
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  },
  async exchangeCode({ code, redirectUri, state }) {
    const t = await postFormAuth(GARMIN.tokenUrl, {
      grant_type: 'authorization_code',
      client_id: env('GARMIN_CLIENT_ID'),
      client_secret: env('GARMIN_CLIENT_SECRET'),
      code,
      redirect_uri: redirectUri,
      code_verifier: await pkceVerifier(state),
    });
    const accessToken = String(t.access_token);
    // The Garmin user id routes the Activity API pushes to the right Peakr user.
    const me = await fetch('https://apis.garmin.com/wellness-api/rest/user/id', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const id = me.ok ? ((await me.json()) as { userId?: string }).userId : undefined;
    return {
      accessToken,
      refreshToken: typeof t.refresh_token === 'string' ? t.refresh_token : null,
      expiresAt: expiry(t.expires_in),
      externalUserId: id ?? null,
    };
  },
  async refresh(refreshToken) {
    const t = await postFormAuth(GARMIN.tokenUrl, {
      grant_type: 'refresh_token',
      client_id: env('GARMIN_CLIENT_ID'),
      client_secret: env('GARMIN_CLIENT_SECRET'),
      refresh_token: refreshToken,
    });
    return {
      accessToken: String(t.access_token),
      refreshToken: typeof t.refresh_token === 'string' ? t.refresh_token : refreshToken,
      expiresAt: expiry(t.expires_in),
      externalUserId: null,
    };
  },
  async revoke(accessToken) {
    // Garmin users revoke from their Garmin Connect account; the user-registration endpoint
    // removes Peakr's registration on our side.
    await fetch('https://apis.garmin.com/wellness-api/rest/user/registration', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  grantedScopes: (query) => (query.get('scope') ?? '').split(/[ ,]/).filter(Boolean),
};

/** COROS partner API: OAuth 2.0 authorization code; the token response carries the `openId`. */
const coros: OAuthProvider = {
  id: 'coros',
  authorizeUrl({ redirectUri, state }) {
    const url = new URL(COROS.authorizeUrl);
    url.search = new URLSearchParams({
      client_id: env('COROS_CLIENT_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    }).toString();
    return url.toString();
  },
  async exchangeCode({ code, redirectUri }) {
    const t = await postFormAuth(COROS.tokenUrl, {
      grant_type: 'authorization_code',
      client_id: env('COROS_CLIENT_ID'),
      client_secret: env('COROS_CLIENT_SECRET'),
      code,
      redirect_uri: redirectUri,
    });
    return {
      accessToken: String(t.access_token),
      refreshToken: typeof t.refresh_token === 'string' ? t.refresh_token : null,
      expiresAt: expiry(t.expires_in),
      externalUserId: typeof t.openId === 'string' ? t.openId : null,
    };
  },
  async refresh(refreshToken) {
    const t = await postFormAuth(COROS.refreshUrl, {
      grant_type: 'refresh_token',
      client_id: env('COROS_CLIENT_ID'),
      client_secret: env('COROS_CLIENT_SECRET'),
      refresh_token: refreshToken,
    });
    return {
      accessToken: String(t.access_token),
      refreshToken: typeof t.refresh_token === 'string' ? t.refresh_token : refreshToken,
      expiresAt: expiry(t.expires_in),
      externalUserId: typeof t.openId === 'string' ? t.openId : null,
    };
  },
  async revoke() {
    // COROS has no revoke endpoint for partners; the user removes Peakr in the COROS app and the
    // tokens are deleted on our side.
  },
  grantedScopes: () => [],
};

/** Suunto Cloud API: OAuth 2.0 authorization code, client credentials as HTTP Basic auth. */
const suunto: OAuthProvider = {
  id: 'suunto',
  authorizeUrl({ redirectUri, state }) {
    const url = new URL(SUUNTO.authorizeUrl);
    url.search = new URLSearchParams({
      client_id: env('SUUNTO_CLIENT_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    }).toString();
    return url.toString();
  },
  async exchangeCode({ code, redirectUri }) {
    return suuntoTokens(
      await postFormAuth(
        SUUNTO.tokenUrl,
        { grant_type: 'authorization_code', code, redirect_uri: redirectUri },
        suuntoBasic(),
      ),
    );
  },
  async refresh(refreshToken) {
    return suuntoTokens(
      await postFormAuth(
        SUUNTO.tokenUrl,
        { grant_type: 'refresh_token', refresh_token: refreshToken },
        suuntoBasic(),
      ),
    );
  },
  async revoke() {
    // Suunto users remove Peakr in the Suunto app; tokens are deleted on our side.
  },
  grantedScopes: () => [],
};

const suuntoBasic = () => ({
  Authorization: `Basic ${btoa(`${env('SUUNTO_CLIENT_ID')}:${env('SUUNTO_CLIENT_SECRET')}`)}`,
});

function suuntoTokens(t: Record<string, unknown>): TokenSet {
  return {
    accessToken: String(t.access_token),
    refreshToken: typeof t.refresh_token === 'string' ? t.refresh_token : null,
    expiresAt: expiry(t.expires_in),
    // The `username` Suunto sends in its workout notifications.
    externalUserId: typeof t.user === 'string' ? t.user : null,
  };
}

const providers: Record<string, OAuthProvider> = { strava, garmin, coros, suunto };

/** Whether a provider may be offered: Strava always, the watch platforms once approved. */
export function providerEnabled(id: string): boolean {
  const env = (name: string) => Deno.env.get(name);
  switch (id) {
    case 'strava':
      return true;
    case 'garmin':
      return (
        flagEnabled(env, 'garminTraining') ||
        flagEnabled(env, 'garminCourses') ||
        flagEnabled(env, 'garminActivity')
      );
    case 'coros':
      return flagEnabled(env, 'coros');
    case 'suunto':
      return flagEnabled(env, 'suunto');
    default:
      return false;
  }
}

export function getProvider(id: string): OAuthProvider | null {
  return providerEnabled(id) ? (providers[id] ?? null) : null;
}
