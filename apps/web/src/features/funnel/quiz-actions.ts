'use server';

import { isoToDay, type QuizAnswers } from '@peakr/quiz';
import { redirect } from 'next/navigation';

import { normalizeEmail } from '@/features/auth/next-path';
import { messages } from '@/i18n';

import { ensureVisitor, getVisitor } from './visitor';

/** Saving the quiz: after every step, so a visitor can close the tab and resume later. */

const MAX_ANSWERS_BYTES = 32_000;

export interface SaveProgress {
  answers: QuizAnswers;
  stepId: string | null;
  finished: boolean;
  quizDate?: string;
}

function validProgress(p: SaveProgress): boolean {
  if (p === null || typeof p !== 'object') return false;
  if (!p.answers || typeof p.answers !== 'object' || Array.isArray(p.answers)) return false;
  if (JSON.stringify(p.answers).length > MAX_ANSWERS_BYTES) return false;
  if (p.stepId !== null && (typeof p.stepId !== 'string' || p.stepId.length > 40)) return false;
  if (p.quizDate !== undefined && isoToDay(p.quizDate) === null) return false;
  return typeof p.finished === 'boolean';
}

/** Returns false when the answers could not be stored (the runner says so and retries). */
export async function saveQuizProgress(progress: SaveProgress): Promise<boolean> {
  if (!validProgress(progress)) return false;
  const visitor = await ensureVisitor();
  if (!visitor) return false;
  const { error } = await visitor.client.from('quiz_sessions').upsert(
    {
      user_id: visitor.user.id,
      answers: progress.answers,
      step_id: progress.stepId,
      finished: progress.finished,
      ...(progress.quizDate ? { quiz_date: progress.quizDate } : {}),
    },
    { onConflict: 'user_id' },
  );
  if (error) console.error('Saving the quiz failed', error.code, error.message);
  return !error;
}

export type EmailState =
  | { status: 'idle' }
  | { status: 'error'; error: 'invalidEmail' | 'consentRequired' | 'unavailable'; email: string };

/** Optional email before the forecast – only with explicit consent to follow-up emails. */
export async function saveForecastEmail(
  _previous: EmailState,
  formData: FormData,
): Promise<EmailState> {
  const raw = String(formData.get('email') ?? '');
  const email = normalizeEmail(raw);
  if (!email) return { status: 'error', error: 'invalidEmail', email: raw };
  if (formData.get('consent') !== 'on') return { status: 'error', error: 'consentRequired', email };
  const visitor = await getVisitor();
  if (!visitor) return { status: 'error', error: 'unavailable', email };
  const { error } = await visitor.client
    .from('quiz_sessions')
    .update({
      email,
      email_consent_text: messages.funnel.email.consent,
      email_consent_at: new Date().toISOString(),
    })
    .eq('user_id', visitor.user.id);
  if (error) {
    console.error('Saving the email failed', error.code);
    return { status: 'error', error: 'unavailable', email };
  }
  redirect('/quiz/forecast');
}
