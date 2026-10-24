import {
  resolveDaily,
  type DailyValue,
  type HealthGroup,
  type HealthMetric,
  type HealthRecord,
  type HealthSource,
} from '@peakr/engine';
import { and, eq, gte, inArray } from 'drizzle-orm';

import { db } from '../db/client';
import { appSettings, healthDaily } from '../db/schema';

/**
 * Body and recovery data on this device (CLAUDE.md "Health"). Rows per metric/day/source;
 * `getDailyValues` deduplicates across sources with the engine's priority (Garmin > Health
 * Connect) and keeps every source id. Tests replace it with the in-memory version in `__mocks__`.
 */

const CURSOR_KEY = 'health.cursor';
const GROUPS_KEY = 'health.groups';

/** One stored value: a metric on a day from one source, with that source's record ids. */
export interface StoredHealthRow {
  metric: HealthMetric;
  day: string;
  source: HealthSource;
  value: number;
  detail: Record<string, unknown> | null;
  recordedAt: string;
  sourceIds: string[];
}

export async function saveHealthRows(rows: readonly StoredHealthRow[]): Promise<void> {
  for (const row of rows) {
    await db
      .insert(healthDaily)
      .values(row)
      .onConflictDoUpdate({
        target: [healthDaily.metric, healthDaily.day, healthDaily.source],
        set: {
          value: row.value,
          detail: row.detail,
          recordedAt: row.recordedAt,
          sourceIds: row.sourceIds,
        },
      });
  }
}

/** Deduplicated daily values, oldest first; optionally only some metrics and from a day on. */
export async function getDailyValues(
  opts: { metrics?: readonly HealthMetric[]; from?: string } = {},
): Promise<DailyValue[]> {
  const conditions = [];
  if (opts.metrics) conditions.push(inArray(healthDaily.metric, [...opts.metrics]));
  if (opts.from) conditions.push(gte(healthDaily.day, opts.from));
  const rows = await db
    .select()
    .from(healthDaily)
    .where(conditions.length ? and(...conditions) : undefined);
  return resolveDaily(rows.flatMap(toRecords));
}

/** Deletes health rows: of one source, of some metrics, or everything. */
export async function deleteHealthRecords(
  opts: { source?: HealthSource; metrics?: readonly HealthMetric[] } = {},
): Promise<void> {
  const conditions = [];
  if (opts.source) conditions.push(eq(healthDaily.source, opts.source));
  if (opts.metrics) conditions.push(inArray(healthDaily.metric, [...opts.metrics]));
  await db.delete(healthDaily).where(conditions.length ? and(...conditions) : undefined);
  if (!opts.metrics && (!opts.source || opts.source === 'garmin')) await setHealthCursor(null);
}

/** A row as engine records, one per source id, so `resolveDaily` keeps every id. */
function toRecords(r: typeof healthDaily.$inferSelect): HealthRecord[] {
  return (r.sourceIds.length ? r.sourceIds : ['']).map((sourceId) => ({
    metric: r.metric,
    day: r.day,
    value: r.value,
    source: r.source,
    sourceId,
    recordedAt: r.recordedAt,
    detail: r.detail ?? null,
  }));
}

async function readSetting(key: string): Promise<string | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return;
  }
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

/** Server cursor of the last Garmin pull (`garmin-health/list?since=`). */
export const getHealthCursor = () => readSetting(CURSOR_KEY);
export const setHealthCursor = (cursor: string | null) => writeSetting(CURSOR_KEY, cursor);

/** The enabled groups as last confirmed by the server (offline copy for Health Connect reads). */
export async function getEnabledGroups(): Promise<HealthGroup[]> {
  try {
    const parsed = JSON.parse((await readSetting(GROUPS_KEY)) ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as HealthGroup[]) : [];
  } catch {
    return [];
  }
}

export const saveEnabledGroups = (groups: readonly HealthGroup[]) =>
  writeSetting(GROUPS_KEY, JSON.stringify(groups));
