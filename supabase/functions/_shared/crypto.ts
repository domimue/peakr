/**
 * Small Web Crypto helpers for Edge Functions:
 * - AES-GCM encryption of OAuth tokens before they are stored (key: TOKEN_ENCRYPTION_KEY,
 *   32 random bytes as base64).
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

let tokenKey: Promise<CryptoKey> | undefined;

function getTokenKey(): Promise<CryptoKey> {
  tokenKey ??= crypto.subtle.importKey(
    'raw',
    fromBase64Url(requireSecret('TOKEN_ENCRYPTION_KEY')),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
  return tokenKey;
}

/** Encrypts a token; the result is `base64url(iv).base64url(ciphertext)`. */
export async function encryptToken(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await getTokenKey(),
    encoder.encode(plain),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

export async function decryptToken(stored: string): Promise<string> {
  const [iv, cipher] = stored.split('.');
  if (!iv || !cipher) throw new Error('Malformed encrypted token');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(iv) },
    await getTokenKey(),
    fromBase64Url(cipher),
  );
  return decoder.decode(plain);
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
