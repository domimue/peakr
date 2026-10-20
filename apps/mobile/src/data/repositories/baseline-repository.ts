import type { BaselineActivity, BaselineOverrides, HrZone, OutlierReason } from '@peakr/engine';
import { eq, inArray } from 'drizzle-orm';

import { db } from '../db/client';
import { appSettings, baselineActivities } from '../db/schema';

/**
 * The Strava baseline on this device (CLAUDE.md "Baseline from past activities"): the recent
 * activities read once for the plan calibration, the user's selection and their own entries on the
 * summary. Reference data only – its own table, never read by the activity sync, matching, history,
 * load, records or plan completion. Tests replace it with the in-memory version in `__mocks__`.
 */

export const BASELINE_KEY = 'baseline';

export interface StoredBaselineActivity extends BaselineActivity {
  name: string | null;
  selected: boolean;
  outlier: OutlierReason | null;
}

export interface BaselineMeta {
  /** Epoch ms of the last import. */
  importedAt: number;
  /** HR zones the user set on Strava themselves; null for default zones or without the scope. */
  stravaHrZones: HrZone[] | null;
  /** The connection predates the zones permission: reconnect to read the Strava zones. */
  zonesScopeMissing: boolean;
  /** Values the user typed on the summary; they win over the derived ones. */
  overrides: BaselineOverrides;
}

export async function getBaselineActivities(): Promise<StoredBaselineActivity[]> {
  const rows = await db.select().from(baselineActivities);
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** Replaces the stored baseline with a fresh import (always the current 60-day snapshot). */
export async function replaceBaseline(
  rows: readonly StoredBaselineActivity[],
  meta: BaselineMeta,
): Promise<void> {
  const value = JSON.stringify(meta);
  db.transaction((tx) => {
    tx.delete(baselineActivities).run();
    for (let i = 0; i < rows.length; i += 100) {
      tx.insert(baselineActivities)
        .values(rows.slice(i, i + 100).map((r) => ({ ...r })))
        .run();
    }
    tx.insert(appSettings)
      .values({ key: BASELINE_KEY, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } })
      .run();
  });
}

export async function setBaselineSelected(
  externalIds: readonly string[],
  selected: boolean,
): Promise<void> {
  if (externalIds.length === 0) return;
  await db
    .update(baselineActivities)
    .set({ selected })
    .where(inArray(baselineActivities.externalId, [...externalIds]));
}

export async function getBaselineMeta(): Promise<BaselineMeta | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, BASELINE_KEY) });
  return row ? (JSON.parse(row.value) as BaselineMeta) : null;
}

export async function saveBaselineOverrides(overrides: BaselineOverrides): Promise<void> {
  const meta = await getBaselineMeta();
  if (!meta) return;
  const value = JSON.stringify({ ...meta, overrides });
  await db.update(appSettings).set({ value }).where(eq(appSettings.key, BASELINE_KEY));
}

/** Removes the baseline from this device (disconnect, account deletion, sign-out). */
export async function clearBaseline(): Promise<void> {
  db.transaction((tx) => {
    tx.delete(baselineActivities).run();
    tx.delete(appSettings).where(eq(appSettings.key, BASELINE_KEY)).run();
  });
}

/**
 * Set when the anonymous quiz user had to be discarded at sign-in because the email or Google
 * identity already belonged to an account (Phase 8a). A Strava connection made during the quiz
 * went with it – and so does its baseline on this device – so the baseline step asks the user to
 * connect Strava again to recalibrate.
 */

const RECONNECT_HINT_KEY = 'baseline.reconnectHint';

export async function setReconnectHint(): Promise<void> {
  const value = new Date().toISOString();
  await clearBaseline();
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
