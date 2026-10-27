import { eq } from 'drizzle-orm';

import { parseAppSettings, type AppSettings } from '../../features/settings/app-settings';
import {
  parseReminderSettings,
  type ReminderSettings,
} from '../../features/notifications/reminder-settings';
import { db } from '../db/client';
import { appSettings } from '../db/schema';

/**
 * Device settings (theme, units, haptics, language) and the daily reminder settings. Tests replace
 * it with the in-memory version in `__mocks__`.
 */

const APP_KEY = 'app.settings';
const REMINDER_KEY = 'notifications.reminder';
const CONGRATS_SENT_KEY = 'notifications.congratsSent';

async function read(key: string): Promise<unknown> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    return null;
  }
}

async function write(key: string, data: unknown): Promise<void> {
  const value = JSON.stringify(data);
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function getAppSettings(): Promise<AppSettings> {
  return parseAppSettings(await read(APP_KEY));
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await write(APP_KEY, settings);
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  return parseReminderSettings(await read(REMINDER_KEY));
}

export async function saveReminderSettings(settings: ReminderSettings): Promise<void> {
  await write(REMINDER_KEY, settings);
}

/** Workouts a congratulation was already sent for (at most one per session). */
export async function getCongratsSent(): Promise<string[]> {
  const raw = await read(CONGRATS_SENT_KEY);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

export async function saveCongratsSent(ids: readonly string[]): Promise<void> {
  await write(CONGRATS_SENT_KEY, ids);
}
