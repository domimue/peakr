import { gymRecordId, type HealthMetric } from '@peakr/engine';
import {
  aggregateGroupByPeriod,
  aggregateRecord,
  deleteRecordsByUuids,
  MealType,
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
  mapNutrition,
  mapSleepSessions,
  mapWorkoutEnergy,
  type DeviceDailyValue,
  type InstantRecord,
} from './device-map';
import type {
  BodyDeviceValue,
  BodyHealthMetric,
  HealthProvider,
  NutritionWrite,
  StrengthWorkoutWrite,
  WriteResult,
} from './types';
import { BODY_HEALTH_METRICS, nutritionRecordId } from './types';

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

/** Record types the Body add-on reads (workout energy needs the sessions and their calories). */
const BODY_RECORDS: Record<BodyHealthMetric, readonly RecordType[]> = {
  weight: ['Weight'],
  body_fat: ['BodyFat'],
  steps: ['Steps'],
  active_kcal: ['ActiveCaloriesBurned'],
  resting_kcal: ['BasalMetabolicRate'],
  intake_kcal: ['Nutrition'],
  workout_kcal: ['ExerciseSession', 'ActiveCaloriesBurned'],
};

async function bodyReadable(): Promise<BodyHealthMetric[]> {
  if (!(await ready())) return [];
  const permissions = await getGrantedPermissions();
  return BODY_HEALTH_METRICS.filter((m) =>
    BODY_RECORDS[m].every((recordType) =>
      permissions.some((g) => g.accessType === 'read' && g.recordType === recordType),
    ),
  );
}

const range = (from: Date, to: Date) => ({
  operator: 'between' as const,
  startTime: from.toISOString(),
  endTime: to.toISOString(),
});

/** Daily totals of an aggregatable record type, in kcal or steps. */
async function dailyTotals(
  metric: 'steps' | 'active_kcal' | 'resting_kcal' | 'intake_kcal',
  from: Date,
  to: Date,
): Promise<BodyDeviceValue[]> {
  const recordType = {
    steps: 'Steps',
    active_kcal: 'ActiveCaloriesBurned',
    resting_kcal: 'BasalMetabolicRate',
    intake_kcal: 'Nutrition',
  }[metric] as 'Steps';
  const groups = await aggregateGroupByPeriod({
    recordType,
    timeRangeFilter: range(from, to),
    timeRangeSlicer: { period: 'DAYS', length: 1 },
  });
  const totals = groups.map((g) => {
    const r = g.result as unknown as Record<
      string,
      { inKilocalories?: number } | number | undefined
    >;
    const key = {
      steps: 'COUNT_TOTAL',
      active_kcal: 'ACTIVE_CALORIES_TOTAL',
      resting_kcal: 'BASAL_CALORIES_TOTAL',
      intake_kcal: 'ENERGY_TOTAL',
    }[metric];
    const v = r[key];
    return { startTime: g.startTime, value: typeof v === 'number' ? v : (v?.inKilocalories ?? 0) };
  });
  const at = new Date().toISOString();
  return mapDailyTotals(metric === 'steps' ? 'steps' : 'active_kcal', totals, at).map((v) => ({
    metric,
    day: v.day,
    value: v.value,
    recordedAt: at,
  }));
}

async function readBodyMetric(
  metric: BodyHealthMetric,
  from: Date,
  to: Date,
): Promise<BodyDeviceValue[]> {
  const asBody = (values: DeviceDailyValue[]) =>
    values.map((v) => ({ metric, day: v.day, value: v.value, recordedAt: v.recordedAt }));
  switch (metric) {
    case 'weight':
    case 'body_fat':
      return asBody(await readMetric(metric, from, to));
    case 'intake_kcal': {
      // Records, not the aggregate: Peakr's own diary entries must be left out.
      const records = await readAll('Nutrition', from, to);
      const at = new Date().toISOString();
      return mapNutrition(
        records.map((r) => ({
          startTime: r.startTime,
          kcal: r.energy?.inKilocalories ?? 0,
          metadata: r.metadata,
        })),
        OWN_PACKAGE,
      ).map((v) => ({ metric, ...v, recordedAt: at }));
    }
    case 'workout_kcal': {
      const sessions = await readAll('ExerciseSession', from, to);
      const withEnergy = [];
      for (const s of sessions) {
        const total = await aggregateRecord({
          recordType: 'ActiveCaloriesBurned',
          timeRangeFilter: range(new Date(s.startTime), new Date(s.endTime)),
        });
        withEnergy.push({
          startTime: s.startTime,
          kcal: total.ACTIVE_CALORIES_TOTAL.inKilocalories,
          metadata: s.metadata,
        });
      }
      const at = new Date().toISOString();
      return mapWorkoutEnergy(withEnergy, OWN_PACKAGE).map((v) => ({
        metric,
        ...v,
        recordedAt: at,
      }));
    }
    default:
      return dailyTotals(metric, from, to);
  }
}

const NUTRITION_WRITE = [{ accessType: 'write', recordType: 'Nutrition' }] as const;
const MEALS = {
  breakfast: MealType.BREAKFAST,
  lunch: MealType.LUNCH,
  dinner: MealType.DINNER,
  snack: MealType.SNACK,
} as const;

async function nutritionWritable(): Promise<boolean> {
  if (!(await ready())) return false;
  const permissions = await getGrantedPermissions();
  return permissions.some((g) => g.accessType === 'write' && g.recordType === 'Nutrition');
}

/** One record per diary entry, at noon of its day (Health Connect needs a time). */
function nutritionRecord(e: NutritionWrite): HealthConnectRecord {
  const start = new Date(`${e.day}T12:00:00`);
  const grams = (v: number | null) =>
    v === null ? undefined : { value: v, unit: 'grams' as const };
  return {
    recordType: 'Nutrition',
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 60_000).toISOString(),
    name: e.name.slice(0, 100),
    mealType: MEALS[e.meal],
    energy: { value: e.kcal, unit: 'kilocalories' },
    ...(grams(e.proteinG) ? { protein: grams(e.proteinG) } : {}),
    ...(grams(e.carbsG) ? { totalCarbohydrate: grams(e.carbsG) } : {}),
    ...(grams(e.fatG) ? { totalFat: grams(e.fatG) } : {}),
    metadata: { clientRecordId: nutritionRecordId(e.entryId), clientRecordVersion: 1 },
  } as HealthConnectRecord;
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
  bodyReadable,
  async requestBodyPermission() {
    if (!(await ready())) return [];
    const types = [...new Set(BODY_HEALTH_METRICS.flatMap((m) => BODY_RECORDS[m]))];
    await requestPermission(
      types.map((recordType) => ({ accessType: 'read' as const, recordType })),
    );
    return bodyReadable();
  },
  async readBody(from, to) {
    const out: BodyDeviceValue[] = [];
    for (const metric of await bodyReadable()) {
      try {
        out.push(...(await readBodyMetric(metric, from, to)));
      } catch (error) {
        console.warn('Health Connect body read failed', metric, String(error));
      }
    }
    return out;
  },
  nutritionWritable,
  async requestNutritionWrite() {
    if (!(await ready())) return false;
    await requestPermission([...NUTRITION_WRITE]);
    return nutritionWritable();
  },
  async writeNutrition(entry) {
    if (!(await nutritionWritable())) return false;
    try {
      await insertRecords([nutritionRecord(entry)]);
      return true;
    } catch (error) {
      console.warn('Health Connect nutrition write failed', String(error));
      return false;
    }
  },
  async deleteNutrition(entryId) {
    if (!(await nutritionWritable())) return;
    await deleteRecordsByUuids('Nutrition', [], [nutritionRecordId(entryId)]).catch(
      () => undefined,
    );
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
