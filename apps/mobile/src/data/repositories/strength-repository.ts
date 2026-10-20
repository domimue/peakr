import type { StrengthSetup } from '@peakr/engine';
import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { appSettings } from '../db/schema';

/**
 * The chosen strength setup (mode, priority, equipment, split). Routines, exercises and logged
 * sessions live in the gym tables (`gym-repository.ts`). Screens use it through the TanStack Query
 * hooks in `features/strength/queries.ts`; tests replace it with the in-memory version in `__mocks__`.
 */

/** Setup without the library parts (routines and custom exercises have their own tables). */
export type StoredStrengthSetup = Omit<StrengthSetup, 'routines' | 'customExercises'>;

const SETUP_KEY = 'strength_setup';

export async function getStrengthSetup(): Promise<StoredStrengthSetup | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, SETUP_KEY) });
  return row ? (JSON.parse(row.value) as StoredStrengthSetup) : null;
}

export async function saveStrengthSetup(setup: StoredStrengthSetup): Promise<void> {
  const value = JSON.stringify(setup);
  await db
    .insert(appSettings)
    .values({ key: SETUP_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
