import { gymRecordId, type HealthMetric } from '@peakr/engine';
import {
  aggregateGroupByPeriod,
  ExerciseType,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  type HealthConnectRecord,
  type RecordType,
} from 'react-native-health-connect';

import {
  DEVICE_RECORD,
  isDeviceMetric,
  mapDailyTotals,
  mapInstant,
  mapSleepSessions,
  type DeviceDailyValue,
  type InstantRecord,
} from './device-map';
import type { HealthProvider, StrengthWorkoutWrite, WriteResult } from './types';

/**
 * Health Connect (Android): finished gym sessions as `ExerciseSession` (strength training) plus
 * `ActiveCaloriesBurned` for the energy estimate. The client record id makes a repeated write an
 * update, not a duplicate, and marks the record as Peakr's own so it is never imported back
 * (`isOwnHealthRecord`). Reading (Insights → Health) asks only for the record types of the data
 * groups the user switched on (CLAUDE.md "Request only the permissions actually needed").
 */

/** Android package of the app – records it wrote itself are never read back. */
const OWN_PACKAGE = 'com.peakr.app';

const WRITE_PERMISSIONS = [
  { accessType: 'write', recordType: 'ExerciseSession' },
  { accessType: 'write', recordType: 'ActiveCaloriesBurned' },
] as const;

async function ready(): Promise<boolean> {
  try {
    if ((await getSdkStatus()) !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
    return await initialize();
  } catch {
    return false;
  }
}

async function granted(): Promise<boolean> {
  const permissions = await getGrantedPermissions();
  return WRITE_PERMISSIONS.every((p) =>
    permissions.some((g) => g.accessType === p.accessType && g.recordType === p.recordType),
  );
}

function records(w: StrengthWorkoutWrite): HealthConnectRecord[] {
  const startTime = new Date(w.startedAt).toISOString();
  const endTime = new Date(Math.max(w.endedAt, w.startedAt + 60_000)).toISOString();
  const clientRecordId = gymRecordId(w.sessionId);
  const out: HealthConnectRecord[] = [
    {
      recordType: 'ExerciseSession',
      exerciseType: ExerciseType.STRENGTH_TRAINING,
      title: w.title,
      ...(w.notes ? { notes: w.notes } : {}),
      startTime,
      endTime,
      metadata: { clientRecordId, clientRecordVersion: 1 },
    },
  ];
  if (w.kcal && w.kcal > 0) {
    out.push({
      recordType: 'ActiveCaloriesBurned',
      energy: { value: w.kcal, unit: 'kilocalories' },
      startTime,
      endTime,
      metadata: { clientRecordId: `${clientRecordId}-energy`, clientRecordVersion: 1 },
    });
  }
  return out;
}

function readPermission(metric: HealthMetric) {
  return isDeviceMetric(metric)
    ? [{ accessType: 'read' as const, recordType: DEVICE_RECORD[metric] as RecordType }]
    : [];
}

async function readable(metrics: readonly HealthMetric[]): Promise<HealthMetric[]> {
  if (!(await ready())) return [];
  const permissions = await getGrantedPermissions();
  return metrics.filter(
    (m) =>
      isDeviceMetric(m) &&
      permissions.some((g) => g.accessType === 'read' && g.recordType === DEVICE_RECORD[m]),
  );
}

async function readAll<T extends RecordType>(recordType: T, from: Date, to: Date) {
  const out = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords(recordType, {
      timeRangeFilter: {
        operator: 'between',
        startTime: from.toISOString(),
        endTime: to.toISOString(),
      },
      ...(pageToken ? { pageToken } : {}),
    });
    out.push(...page.records);
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return out;
}

async function readMetric(metric: HealthMetric, from: Date, to: Date): Promise<DeviceDailyValue[]> {
  const instant = (records: InstantRecord[], pick: 'median' | 'latest', decimals = 0) =>
    mapInstant(metric, records, pick, OWN_PACKAGE, decimals);
  switch (metric) {
    case 'sleep_duration':
      return mapSleepSessions(await readAll('SleepSession', from, to), OWN_PACKAGE);
    case 'resting_hr':
      return instant(
        (await readAll('RestingHeartRate', from, to)).map((r) => ({
          ...r,
          value: r.beatsPerMinute,
        })),
        'median',
      );
    case 'hrv_night':
      return instant(
        (await readAll('HeartRateVariabilityRmssd', from, to)).map((r) => ({
          ...r,
          value: r.heartRateVariabilityMillis,
        })),
        'median',
      );
    case 'spo2_avg':
      return instant(
        (await readAll('OxygenSaturation', from, to)).map((r) => ({ ...r, value: r.percentage })),
        'median',
      );
    case 'respiration_avg':
      return instant(
        (await readAll('RespiratoryRate', from, to)).map((r) => ({ ...r, value: r.rate })),
        'median',
        1,
      );
    case 'weight':
      return instant(
        (await readAll('Weight', from, to)).map((r) => ({ ...r, value: r.weight.inKilograms })),
        'latest',
        1,
      );
    case 'body_fat':
      return instant(
        (await readAll('BodyFat', from, to)).map((r) => ({ ...r, value: r.percentage })),
        'latest',
        1,
      );
    case 'vo2max':
      return instant(
        (await readAll('Vo2Max', from, to)).map((r) => ({
          ...r,
          value: r.vo2MillilitersPerMinuteKilogram,
        })),
        'latest',
      );
    case 'steps':
    case 'floors': {
      const groups = await aggregateGroupByPeriod({
        recordType: metric === 'steps' ? 'Steps' : 'FloorsClimbed',
        timeRangeFilter: {
          operator: 'between',
          startTime: from.toISOString(),
          endTime: to.toISOString(),
        },
        timeRangeSlicer: { period: 'DAYS', length: 1 },
      });
      const totals = groups.map((g) => {
        const r = g.result as { COUNT_TOTAL?: number; FLOORS_CLIMBED_TOTAL?: number };
        return {
          startTime: g.startTime,
          value: (metric === 'steps' ? r.COUNT_TOTAL : r.FLOORS_CLIMBED_TOTAL) ?? 0,
        };
      });
      return mapDailyTotals(metric, totals, new Date().toISOString());
    }
    default:
      return [];
  }
}

export const health: HealthProvider = {
  store: 'healthConnect',
  isSupported: ready,
  async hasWritePermission() {
    return (await ready()) && (await granted());
  },
  async requestWritePermission() {
    if (!(await ready())) return false;
    await requestPermission([...WRITE_PERMISSIONS]);
    return granted();
  },
  async writeStrengthWorkout(workout): Promise<WriteResult> {
    if (!(await ready())) return { ok: false, reason: 'unsupported' };
    if (!(await granted())) return { ok: false, reason: 'permission' };
    try {
      const ids = await insertRecords(records(workout));
      return { ok: true, recordId: ids[0] ?? null };
    } catch (error) {
      console.warn('Health Connect write failed', String(error));
      return { ok: false, reason: 'failed' };
    }
  },
  readableMetrics: readable,
  async requestReadPermission(metrics) {
    if (!(await ready())) return [];
    await requestPermission(metrics.flatMap(readPermission));
    return readable(metrics);
  },
  async readDaily(metrics, from, to) {
    const allowed = await readable(metrics);
    const out: DeviceDailyValue[] = [];
    for (const metric of allowed) {
      try {
        out.push(...(await readMetric(metric, from, to)));
      } catch (error) {
        // One record type failing (permission withdrawn meanwhile) must not stop the others.
        console.warn('Health Connect read failed', metric, String(error));
      }
    }
    return out;
  },
};
