import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

/**
 * Service-role client for Edge Functions. Bypasses Row Level Security, so every query must filter
 * by the user it acts for. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
 */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The signed-in user from the request's `Authorization: Bearer <jwt>`, or null. */
export async function userFromRequest(req: Request, admin: SupabaseClient): Promise<User | null> {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  return error ? null : data.user;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
