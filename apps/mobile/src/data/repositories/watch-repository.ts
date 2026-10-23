import { eq } from 'drizzle-orm';

import { parseWatchChoice, type WatchChoice } from '../../features/watch/options';
import { db } from '../db/client';
import { appSettings } from '../db/schema';

/** The watch the user picked (onboarding / Profile → Watch), kept on this device. */

const KEY = 'watch.choice';

export async function getWatchChoice(): Promise<WatchChoice | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) });
  if (!row) return null;
  try {
    return parseWatchChoice(JSON.parse(row.value));
  } catch {
    return null;
  }
}

export async function saveWatchChoice(choice: WatchChoice): Promise<void> {
  const value = JSON.stringify(choice);
  await db
    .insert(appSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
