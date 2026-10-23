import type { Fetch } from '../watch/http.ts';
import {
  createGarminPersonalHealthApi,
  mintPersonalToken,
  tokenUsable,
  type BearerToken,
  type PullResult,
} from './garmin-personal.ts';
import { DELIVERY, type CredentialMode, type HealthDelivery, type HealthGroup } from './model.ts';

/**
 * One interface for both Garmin credential modes. The Edge Function asks the provider for data;
 * whether that is a pull with a personal key or push notifications on the OAuth tier is the
 * provider's business, and nothing outside this file (and the app least of all) knows which.
 */
export interface GarminHealthProvider {
  readonly delivery: HealthDelivery;
  /**
   * Fetch a day range. Push-only connections answer `unsupported` – their data arrives through
   * `watch-webhook/garmin-health`.
   */
  pull(
    groups: ReadonlySet<HealthGroup>,
    from: string,
    to: string,
  ): Promise<PullResult | { ok: false; failure: 'unsupported'; calls: 0 }>;
  /** The token to persist after a call (minted again from the key when it ran out). */
  currentToken(): BearerToken | null;
}

export interface ProviderCredentials {
  mode: CredentialMode;
  /** Decrypted personal API key (personal_key mode). */
  apiKey?: string | null;
  /** Cached bearer token, if still stored. */
  token?: BearerToken | null;
}

export function createGarminHealthProvider(
  creds: ProviderCredentials,
  { fetch, now = () => Date.now(), base }: { fetch: Fetch; now?: () => number; base?: string },
): GarminHealthProvider {
  if (creds.mode === 'oauth') {
    return {
      delivery: DELIVERY.oauth,
      pull: () => Promise.resolve({ ok: false, failure: 'unsupported', calls: 0 }),
      currentToken: () => creds.token ?? null,
    };
  }
  let token = creds.token ?? null;
  return {
    delivery: DELIVERY.personal_key,
    currentToken: () => token,
    async pull(groups, from, to) {
      if (!tokenUsable(token, now())) {
        if (!creds.apiKey) return { ok: false, failure: 'not_connected', calls: 0 };
        const minted = await mintPersonalToken(fetch, creds.apiKey, base);
        if (!minted.ok) {
          return {
            ok: false,
            failure:
              minted.reason === 'invalid_key'
                ? 'not_connected'
                : minted.reason === 'rate_limited'
                  ? 'rate_limited'
                  : 'unavailable',
            calls: 1,
          };
        }
        token = minted.token;
      }
      const api = createGarminPersonalHealthApi({ fetch, accessToken: token.accessToken, base });
      return api.pull(groups, from, to);
    },
  };
}
