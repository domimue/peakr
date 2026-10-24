import 'server-only';

import type { QuizAnswers } from '@peakr/quiz';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { currentUser, sessionClient } from '@/lib/supabase/server';

import {
  FUNNEL_COOKIE,
  FUNNEL_COOKIE_MAX_AGE,
  funnelSecret,
  signFunnelUser,
  verifyFunnelUser,
} from './funnel-cookie';

/**
 * The visitor of the funnel: the Supabase user of this browser – an anonymous user created on the
 * first quiz answer, or the account when signed in – and their saved quiz (`quiz_sessions`).
 */

export interface Visitor {
  client: SupabaseClient;
  user: User;
}

export interface QuizProgress {
  answers: QuizAnswers;
  stepId: string | null;
  finished: boolean;
  /** Local date the quiz was finished on (plan start). */
  quizDate: string | null;
  email: string | null;
}

export async function getVisitor(): Promise<Visitor | null> {
  const client = await sessionClient();
  const user = await currentUser(client);
  return client && user ? { client, user } : null;
}

/**
 * The visitor, signing in anonymously first when there is no session (Server Functions and Route
 * Handlers only – it writes cookies). Remembers the anonymous user in the signed funnel cookie.
 */
export async function ensureVisitor(): Promise<Visitor | null> {
  const existing = await getVisitor();
  if (existing) return existing;
  const client = await sessionClient();
  if (!client) return null;
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) {
    console.error('Anonymous sign-in failed', error?.code ?? error?.status);
    return null;
  }
  const secret = funnelSecret();
  if (secret) {
    (await cookies()).set(FUNNEL_COOKIE, signFunnelUser(data.user.id, secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: FUNNEL_COOKIE_MAX_AGE,
    });
  }
  return { client, user: data.user };
}

/** The anonymous quiz user this browser ran the funnel with, if the cookie is valid. */
export async function funnelUserId(): Promise<string | null> {
  return verifyFunnelUser((await cookies()).get(FUNNEL_COOKIE)?.value, funnelSecret());
}

export async function clearFunnelCookie(): Promise<void> {
  (await cookies()).delete(FUNNEL_COOKIE);
}

interface QuizRow {
  answers: QuizAnswers | null;
  step_id: string | null;
  finished: boolean;
  quiz_date: string | null;
  email: string | null;
}

export async function loadQuiz(visitor: Visitor): Promise<QuizProgress | null> {
  const { data, error } = await visitor.client
    .from('quiz_sessions')
    .select('answers, step_id, finished, quiz_date, email')
    .eq('user_id', visitor.user.id)
    .maybeSingle<QuizRow>();
  if (error) throw new Error(`Loading the quiz failed: ${error.message}`);
  if (!data) return null;
  return {
    answers: data.answers ?? {},
    stepId: data.step_id,
    finished: data.finished,
    quizDate: data.quiz_date,
    email: data.email,
  };
}
