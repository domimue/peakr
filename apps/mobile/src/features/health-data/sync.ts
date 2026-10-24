import { HEALTH_GROUPS, metricsOfGroup } from '@peakr/engine';

import {
  deleteHealthRecords,
  getHealthCursor,
  saveEnabledGroups,
  saveHealthRows,
  setHealthCursor,
} from '@/data/repositories/health-repository';

import { fetchHealthRows, fetchHealthStatus, type HealthStatus } from './api';

/** Pages per sync run (1,000 rows each), so a long backfill does not block the app. */
const MAX_PAGES = 20;

/**
 * Brings the device copy of the Garmin values up to date: rows changed since the last cursor.
 * Without a Garmin connection any Garmin rows on this device are removed (disconnected or
 * deleted elsewhere). Health Connect values are read separately (`read-device.ts`).
 */
export async function syncGarminHealth(status?: HealthStatus): Promise<HealthStatus> {
  const current = status ?? (await fetchHealthStatus());
  await saveEnabledGroups(current.groups);
  if (!current.connection) {
    await deleteHealthRecords({ source: 'garmin' });
    return current;
  }
  // Groups switched off (here or on another device): their values go from this device as well.
  const off = HEALTH_GROUPS.filter((g) => !current.groups.includes(g)).flatMap(metricsOfGroup);
  if (off.length) await deleteHealthRecords({ metrics: off });
  let cursor = await getHealthCursor();
  for (let page = 0; page < MAX_PAGES; page++) {
    const { rows, cursor: next, more } = await fetchHealthRows(cursor);
    await saveHealthRows(
      rows.map((r) => ({
        metric: r.metric,
        day: r.day,
        source: 'garmin' as const,
        value: r.value,
        detail: r.detail,
        recordedAt: r.recordedAt,
        sourceIds: r.sourceIds,
      })),
    );
    cursor = next;
    await setHealthCursor(cursor);
    if (!more) break;
  }
  return current;
}
