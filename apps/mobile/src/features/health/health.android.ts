import { gymRecordId } from '@peakr/engine';
import {
  ExerciseType,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  requestPermission,
  SdkAvailabilityStatus,
  type HealthConnectRecord,
} from 'react-native-health-connect';

import type { HealthProvider, StrengthWorkoutWrite, WriteResult } from './types';

/**
 * Health Connect (Android): finished gym sessions as `ExerciseSession` (strength training) plus
 * `ActiveCaloriesBurned` for the energy estimate. Only the two write permissions are requested –
 * nothing is read. The client record id makes a repeated write an update, not a duplicate, and
 * marks the record as Peakr's own so it is never imported back (`isOwnHealthRecord`).
 */

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
};
