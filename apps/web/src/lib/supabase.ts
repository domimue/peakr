import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client with the publishable (anon) key. Row Level Security only allows
 * inserting into the waitlist with it. Returns null when the project is not configured.
 */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
