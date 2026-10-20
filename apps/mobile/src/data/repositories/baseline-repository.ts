import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { appSettings } from '../db/schema';

/**
 * Set when the anonymous quiz user had to be discarded at sign-in because the email or Google
 * identity already belonged to an account (Phase 8a). A Strava connection made during the quiz
 * went with it, so the baseline summary asks the user to connect Strava again to recalibrate.
 */

const RECONNECT_HINT_KEY = 'baseline.reconnectHint';

export async function setReconnectHint(): Promise<void> {
  const value = new Date().toISOString();
  await db
    .insert(appSettings)
    .values({ key: RECONNECT_HINT_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function hasReconnectHint(): Promise<boolean> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, RECONNECT_HINT_KEY),
  });
  return row !== undefined;
}

export async function clearReconnectHint(): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, RECONNECT_HINT_KEY));
}
