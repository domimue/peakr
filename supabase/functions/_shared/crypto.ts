/**
 * Small Web Crypto helpers for Edge Functions:
 * - AES-GCM encryption of OAuth tokens before they are stored (key: TOKEN_ENCRYPTION_KEY,
 *   32 random bytes as base64) and of health values (key: HEALTH_ENCRYPTION_KEY, same format).
 * - HMAC-signed `state` for OAuth redirects, so the callback knows which user started the flow
 *   without trusting anything the browser sends (key: OAUTH_STATE_SECRET).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function requireSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
}

const aesKeys = new Map<string, Promise<CryptoKey>>();

/** AES-GCM key from a secret holding 32 random bytes as base64(url). */
function getAesKey(secret: string): Promise<CryptoKey> {
  let key = aesKeys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', fromBase64Url(requireSecret(secret)), 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
    aesKeys.set(secret, key);
  }
  return key;
}

async function encryptWith(secret: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await getAesKey(secret),
    encoder.encode(plain),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

async function decryptWith(secret: string, stored: string): Promise<string> {
  const [iv, cipher] = stored.split('.');
  if (!iv || !cipher) throw new Error('Malformed encrypted value');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(iv) },
    await getAesKey(secret),
    fromBase64Url(cipher),
  );
  return decoder.decode(plain);
}

/** Encrypts a token; the result is `base64url(iv).base64url(ciphertext)`. */
export function encryptToken(plain: string): Promise<string> {
  return encryptWith('TOKEN_ENCRYPTION_KEY', plain);
}

export function decryptToken(stored: string): Promise<string> {
  return decryptWith('TOKEN_ENCRYPTION_KEY', stored);
}

/**
 * Health values (CLAUDE.md "Health": stored encrypted) use their own key, HEALTH_ENCRYPTION_KEY,
 * so a leaked token key does not open the health data and vice versa.
 */
export function encryptHealth(plain: string): Promise<string> {
  return encryptWith('HEALTH_ENCRYPTION_KEY', plain);
}

export function decryptHealth(stored: string): Promise<string> {
  return decryptWith('HEALTH_ENCRYPTION_KEY', stored);
}

let stateKey: Promise<CryptoKey> | undefined;

function getStateKey(): Promise<CryptoKey> {
  stateKey ??= crypto.subtle.importKey(
    'raw',
    encoder.encode(requireSecret('OAUTH_STATE_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return stateKey;
}

/**
 * PKCE (RFC 7636) without storage: the code verifier is an HMAC of the signed state, so the
 * callback can recompute it. The state is unguessable and short-lived; the verifier never leaves
 * the Edge Function (only its SHA-256 challenge goes into the authorize URL).
 */
export async function pkceVerifier(state: string): Promise<string> {
  const mac = await crypto.subtle.sign(
    'HMAC',
    await getStateKey(),
    encoder.encode(`pkce:${state}`),
  );
  return toBase64Url(new Uint8Array(mac));
}

export async function pkceChallenge(state: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(await pkceVerifier(state)));
  return toBase64Url(new Uint8Array(digest));
}

/** `upload`: an existing connection asks for `activity:write` (gym sessions to Strava). */
export type OAuthPurpose = 'baseline' | 'upload';

export interface OAuthState {
  /** Supabase user id that started the flow. */
  userId: string;
  provider: string;
  /**
   * Why the flow was started. 'baseline' = from plan creation, to read the baseline only (no
   * activity backfill). Absent on states signed before it existed and on normal connections.
   */
  purpose?: OAuthPurpose;
  /** Expiry, epoch milliseconds. */
  exp: number;
  nonce: string;
}

const STATE_TTL_MS = 10 * 60 * 1000;

export async function signState(
  userId: string,
  provider: string,
  { purpose, now = Date.now() }: { purpose?: OAuthPurpose; now?: number } = {},
): Promise<string> {
  const state: OAuthState = {
    userId,
    provider,
    ...(purpose ? { purpose } : {}),
    exp: now + STATE_TTL_MS,
    nonce: toBase64Url(crypto.getRandomValues(new Uint8Array(12))),
  };
  const payload = toBase64Url(encoder.encode(JSON.stringify(state)));
  const signature = await crypto.subtle.sign('HMAC', await getStateKey(), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns the state if the signature is valid and it has not expired, else null. */
export async function verifyState(value: string, now = Date.now()): Promise<OAuthState | null> {
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const valid = await crypto.subtle.verify(
    'HMAC',
    await getStateKey(),
    fromBase64Url(signature),
    encoder.encode(payload),
  );
  if (!valid) return null;
  try {
    const state = JSON.parse(decoder.decode(fromBase64Url(payload))) as OAuthState;
    return state.exp > now ? state : null;
  } catch {
    return null;
  }
}
