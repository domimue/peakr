import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Supabase on the website server. Two clients:
 * - `sessionClient()`: acts as the visitor (anonymous quiz user or account) with the session from
 *   the auth cookies, so Row Level Security applies – quiz answers, sign-in, account data.
 * - `adminClient()`: the secret (service role) key, for the few steps that cross users (attaching
 *   a checkout to the account, writing the plan, deleting the anonymous user). Never in the browser.
 * Both return null when Supabase is not configured (local development without a project).
 */

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export const supabaseConfigured = () => config() !== null;

export async function sessionClient(): Promise<SupabaseClient | null> {
  const c = config();
  if (!c) return null;
  const store = await cookies();
  return createServerClient(c.url, c.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes the
          // session on the next request.
        }
      },
    },
  });
}

export function adminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The signed-in user (verified with Supabase), anonymous or not; null without a session. */
export async function currentUser(client: SupabaseClient | null): Promise<User | null> {
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

/** A real account (not the anonymous quiz user). */
export const isAccount = (user: User | null): user is User => user !== null && !user.is_anonymous;
