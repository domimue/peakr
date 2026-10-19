import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { create } from 'zustand';

import { supabase } from '@/data/supabase';

interface SessionState {
  session: Session | null;
  /** The stored session was read (or Supabase is not configured). */
  ready: boolean;
}

export const useSessionStore = create<SessionState>()(() => ({
  session: null,
  ready: supabase === null,
}));

/** Keeps the session store in step with Supabase Auth. Mounted once in the root layout. */
export function useAuthListener(): void {
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      useSessionStore.setState({ session, ready: true });
    });
    return () => data.subscription.unsubscribe();
  }, []);
}

/** Supabase is configured for this build (sign-in and sync are available). */
export const authAvailable = supabase !== null;
