import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

/**
 * Supabase client of the app (publishable key only – secrets live in Edge Functions). The session
 * is kept in expo-sqlite's localStorage. Null when the project is not configured (see
 * `.env.example`); the app then works fully offline without an account.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function create(supabaseUrl: string, publishableKey: string): SupabaseClient {
  // Installs `globalThis.localStorage` backed by SQLite; loaded only when Supabase is used.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('expo-sqlite/localStorage/install');
  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // Magic links and OAuth return a `code` to the app (peakr://auth/callback?code=…).
      flowType: 'pkce',
    },
  });
  // Refresh the session only while the app is in the foreground (Supabase React Native guide).
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  });
  return client;
}

export const supabase: SupabaseClient | null = url && key ? create(url, key) : null;
