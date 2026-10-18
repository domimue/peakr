import type { QuizAnswers } from '@peakr/quiz';
import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { appSettings } from '../db/schema';

/**
 * Local onboarding quiz progress, so the user can leave and resume where they stopped. Stored as
 * JSON in the key/value settings table; tests replace it with the in-memory version in `__mocks__`.
 */

export interface QuizProgress {
  answers: QuizAnswers;
  /** Step the user is on; null before the first answer. */
  stepId: string | null;
  /** The insight after `stepId` is showing. */
  insight: boolean;
  /** The user reached the forecast. */
  finished: boolean;
}

const KEY = 'onboarding_quiz';

export async function getQuizProgress(): Promise<QuizProgress | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) });
  return row ? (JSON.parse(row.value) as QuizProgress) : null;
}

export async function saveQuizProgress(progress: QuizProgress): Promise<void> {
  const value = JSON.stringify(progress);
  await db
    .insert(appSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function clearQuizProgress(): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, KEY));
}
