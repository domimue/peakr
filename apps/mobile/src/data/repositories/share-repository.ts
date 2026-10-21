import {
  DEFAULT_SHARE_SETTINGS,
  parseShareSettings,
  type ShareSettings,
  type ShareState,
  type ShareTarget,
} from '@peakr/engine';
import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { appSettings } from '../db/schema';

/**
 * Where finished gym sessions were shared (Strava, Health Connect / HealthKit) and the user's
 * defaults. Key-value rows in `app_settings`; tests replace it with the in-memory `__mocks__`.
 */

const SETTINGS_KEY = 'gym.share.settings';
const stateKey = (sessionId: string) => `gym.share.${sessionId}`;

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

export async function getShareSettings(): Promise<ShareSettings> {
  return parseShareSettings(await read(SETTINGS_KEY)) ?? DEFAULT_SHARE_SETTINGS;
}

export async function saveShareSettings(settings: ShareSettings): Promise<void> {
  await write(SETTINGS_KEY, settings);
}

export type SessionShares = Partial<Record<ShareTarget, ShareState>>;

export async function getShareStates(sessionId: string): Promise<SessionShares> {
  const value = await read(stateKey(sessionId));
  return value && typeof value === 'object' ? (value as SessionShares) : {};
}

export async function saveShareState(
  sessionId: string,
  target: ShareTarget,
  state: ShareState,
): Promise<void> {
  const current = await getShareStates(sessionId);
  await write(stateKey(sessionId), { ...current, [target]: state });
}
