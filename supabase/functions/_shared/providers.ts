/**
 * OAuth providers the `oauth` function can connect. Client ids and secrets come only from
 * Supabase secrets (`supabase secrets set …`), never from the app.
 *
 * Further providers (Garmin, COROS, Suunto, Komoot, Zwift) are added here once their partner
 * programmes have approved Peakr; until then they are simply not listed. Hevy uses a personal API
 * key instead of OAuth and gets its own function.
 */

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds, or null if the token does not expire. */
  expiresAt: number | null;
  /** The user's id at the provider (e.g. Strava athlete id). */
  externalUserId: string | null;
}

export interface OAuthProvider {
  id: 'strava';
  authorizeUrl(params: { redirectUri: string; state: string }): string;
  /** Exchanges the authorization code from the callback for tokens. */
  exchangeCode(params: { code: string; redirectUri: string }): Promise<TokenSet>;
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
  authorizeUrl({ redirectUri, state }) {
    const url = new URL('https://www.strava.com/oauth/mobile/authorize');
    url.search = new URLSearchParams({
      client_id: env('STRAVA_CLIENT_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      // read_all: private routes too (athletes who connected before only get public ones).
      // profile:read_all: the athlete's HR zones for the baseline (plan calibration).
      scope: 'read,read_all,activity:read_all,profile:read_all',
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

const providers: Record<string, OAuthProvider> = { strava };

export function getProvider(id: string): OAuthProvider | null {
  return providers[id] ?? null;
}
