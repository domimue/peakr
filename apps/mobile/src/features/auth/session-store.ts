import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { create } from 'zustand';

import { supabase } from '@/data/supabase';

interface SessionState {
  session: Session | null;
  /**
   * The session belongs to an anonymous Supabase user (created during the quiz, e.g. to connect
   * Strava). It is not an account: no sync, no Settings → Account, and sign-in converts it.
   */
  isAnonymous: boolean;
  /** The stored session was read (or Supabase is not configured). */
  ready: boolean;
  /**
   * Returns the current user id, signing in anonymously first when there is no session (for
   * steps that need a Supabase user before the account exists). Throws without Supabase.
   */
  ensureSession: () => Promise<string>;
}

let anonymousSignIn: Promise<string> | null = null;

export const useSessionStore = create<SessionState>()((set, get) => ({
  session: null,
  isAnonymous: false,
  ready: supabase === null,
  ensureSession: async () => {
    const current = get().session;
    if (current) return current.user.id;
    if (!supabase) throw new Error('Supabase is not configured');
    const client = supabase;
    // Single flight: two steps asking at once must not create two anonymous users.
    anonymousSignIn ??= (async () => {
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      if (!data.session || !data.user) throw new Error('No anonymous session returned');
      set(sessionState(data.session));
      return data.user.id;
    })().finally(() => {
      anonymousSignIn = null;
    });
    return anonymousSignIn;
  },
}));

function sessionState(session: Session | null) {
  return { session, isAnonymous: session?.user.is_anonymous === true, ready: true };
}

/** The signed-in account's user id – null without a session and for an anonymous user. */
export const selectAccountUserId = (s: SessionState): string | null =>
  s.session && !s.isAnonymous ? s.session.user.id : null;

/** Keeps the session store in step with Supabase Auth. Mounted once in the root layout. */
export function useAuthListener(): void {
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      useSessionStore.setState(sessionState(session));
    });
    return () => data.subscription.unsubscribe();
  }, []);
}

/** Supabase is configured for this build (sign-in and sync are available). */
export const authAvailable = supabase !== null;
