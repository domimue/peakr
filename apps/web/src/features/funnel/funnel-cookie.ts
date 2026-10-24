import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The `peakr_funnel` cookie remembers which anonymous Supabase user ran the quiz in this browser.
 * Signing in to an account replaces the anonymous session, so this cookie is how the account can
 * still claim the answers and the checkout afterwards (`claim.ts`). Signed with
 * FUNNEL_COOKIE_SECRET so nobody can put another visitor's id in it; httpOnly.
 */

export const FUNNEL_COOKIE = 'peakr_funnel';
export const FUNNEL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const mac = (userId: string, secret: string) =>
  createHmac('sha256', secret).update(`funnel:${userId}`).digest('base64url');

export function signFunnelUser(userId: string, secret: string): string {
  return `${userId}.${mac(userId, secret)}`;
}

/** The anonymous user id in a cookie value, or null when it is missing, malformed or forged. */
export function verifyFunnelUser(value: string | undefined, secret: string): string | null {
  if (!value || !secret) return null;
  const [userId = '', signature = ''] = value.split('.', 2);
  if (!UUID.test(userId)) return null;
  const expected = Buffer.from(mac(userId, secret));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}

export const funnelSecret = () => process.env.FUNNEL_COOKIE_SECRET ?? '';
