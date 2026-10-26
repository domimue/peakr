import { isOwnHealthRecord, median, type HealthMetric } from '@peakr/engine';

/**
 * Health Connect / HealthKit records → one value per metric and local day (pure, so it is tested
 * without a phone). Only metrics the store actually has a record type for are listed; everything
 * else is "not provided" by the phone.
 */

export const DEVICE_RECORD = {
  sleep_duration: 'SleepSession',
  resting_hr: 'RestingHeartRate',
  hrv_night: 'HeartRateVariabilityRmssd',
  steps: 'Steps',
  floors: 'FloorsClimbed',
  spo2_avg: 'OxygenSaturation',
  respiration_avg: 'RespiratoryRate',
  weight: 'Weight',
  body_fat: 'BodyFat',
  vo2max: 'Vo2Max',
} as const satisfies Partial<Record<HealthMetric, string>>;

export type DeviceMetric = keyof typeof DEVICE_RECORD;
export const DEVICE_METRICS = Object.keys(DEVICE_RECORD) as DeviceMetric[];

export function isDeviceMetric(m: HealthMetric): m is DeviceMetric {
  return m in DEVICE_RECORD;
}

/** Health Connect keeps 30 days readable without the extra history permission. */
export const DEVICE_READ_DAYS = 30;

export interface DeviceDailyValue {
  metric: HealthMetric;
  day: string;
  value: number;
  detail: Record<string, unknown> | null;
  recordedAt: string;
  sourceIds: string[];
}

interface Meta {
  metadata?: { id?: string; clientRecordId?: string | null; dataOrigin?: string | null };
}
export interface InstantRecord extends Meta {
  time: string;
  value: number;
}
export interface SleepRecord extends Meta {
  startTime: string;
  endTime: string;
  stages?: { startTime: string; endTime: string; stage: number }[];
}
export interface DailyTotal {
  /** Start of the local day the total belongs to. */
  startTime: string;
  value: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar day in the phone's time zone. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localClock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const minutesBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;

function idOf(r: Meta, fallback: string): string {
  return r.metadata?.id ?? fallback;
}

/** Health Connect sleep stage numbers (SleepStageType). */
const STAGE = { awake: 1, sleeping: 2, outOfBed: 3, light: 4, deep: 5, rem: 6 } as const;

/**
 * One sleep value per wake-up day: the longest session that ended that day. Asleep time is the sum
 * of the sleep stages when there are any, else the session length.
 */
export function mapSleepSessions(
  records: readonly SleepRecord[],
  ownPackage: string,
): DeviceDailyValue[] {
  const best = new Map<string, SleepRecord>();
  for (const r of records) {
    if (isOwnHealthRecord(r.metadata ?? {}, ownPackage)) continue;
    const day = localDay(r.endTime);
    const prev = best.get(day);
    if (
      !prev ||
      minutesBetween(r.startTime, r.endTime) > minutesBetween(prev.startTime, prev.endTime)
    ) {
      best.set(day, r);
    }
  }
  const out: DeviceDailyValue[] = [];
  for (const [day, r] of best) {
    const stages = r.stages ?? [];
    const sum = (codes: readonly number[]) =>
      Math.round(
        stages
          .filter((s) => codes.includes(s.stage))
          .reduce((m, s) => m + minutesBetween(s.startTime, s.endTime), 0),
      );
    const staged = stages.length > 0;
    const asleep = staged
      ? sum([STAGE.sleeping, STAGE.light, STAGE.deep, STAGE.rem])
      : Math.round(minutesBetween(r.startTime, r.endTime));
    if (asleep <= 0) continue;
    out.push({
      metric: 'sleep_duration',
      day,
      value: asleep,
      detail: {
        deepMin: staged ? sum([STAGE.deep]) : null,
        lightMin: staged ? sum([STAGE.light]) : null,
        remMin: staged ? sum([STAGE.rem]) : null,
        awakeMin: staged ? sum([STAGE.awake, STAGE.outOfBed]) : null,
        bedTime: localClock(r.startTime),
        wakeTime: localClock(r.endTime),
      },
      recordedAt: new Date(r.endTime).toISOString(),
      sourceIds: [idOf(r, `sleep-${day}`)],
    });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Instantaneous readings per day: the median (resting HR, HRV, SpO2, respiration) or the latest
 * (weight, body fat, VO2max – a measurement, not a level that varies through the day).
 */
export function mapInstant(
  metric: HealthMetric,
  records: readonly InstantRecord[],
  pick: 'median' | 'latest',
  ownPackage: string,
  decimals = 0,
): DeviceDailyValue[] {
  const byDay = new Map<string, InstantRecord[]>();
  for (const r of records) {
    if (!Number.isFinite(r.value) || isOwnHealthRecord(r.metadata ?? {}, ownPackage)) continue;
    const day = localDay(r.time);
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  const f = 10 ** decimals;
  const out: DeviceDailyValue[] = [];
  for (const [day, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.time.localeCompare(b.time));
    const last = sorted.at(-1) as InstantRecord;
    const raw = pick === 'latest' ? last.value : (median(sorted.map((r) => r.value)) as number);
    out.push({
      metric,
      day,
      value: Math.round(raw * f) / f,
      detail: null,
      recordedAt: new Date(last.time).toISOString(),
      sourceIds: sorted.map((r, i) => idOf(r, `${metric}-${day}-${i}`)),
    });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** Workouts with their energy → one total per local day (the Body add-on's workout energy). */
export function mapWorkoutEnergy(
  sessions: readonly { startTime: string; kcal: number; metadata?: Meta['metadata'] }[],
  ownPackage: string,
): { day: string; value: number }[] {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    if (!(s.kcal > 0) || isOwnHealthRecord(s.metadata ?? {}, ownPackage)) continue;
    const day = localDay(s.startTime);
    byDay.set(day, (byDay.get(day) ?? 0) + s.kcal);
  }
  return [...byDay.entries()]
    .map(([day, value]) => ({ day, value: Math.round(value) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Nutrition records → kcal per local day, leaving out Peakr's own diary entries (written by this
 * app) so the diary is never counted twice.
 */
export function mapNutrition(
  records: readonly { startTime: string; kcal: number; metadata?: Meta['metadata'] }[],
  ownPackage: string,
): { day: string; value: number }[] {
  const byDay = new Map<string, number>();
  for (const r of records) {
    const meta = r.metadata ?? {};
    if (!(r.kcal > 0) || isOwnHealthRecord(meta, ownPackage)) continue;
    if ((meta.clientRecordId ?? '').startsWith('peakr-food-')) continue;
    const day = localDay(r.startTime);
    byDay.set(day, (byDay.get(day) ?? 0) + r.kcal);
  }
  return [...byDay.entries()]
    .map(([day, value]) => ({ day, value: Math.round(value) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Daily totals from the store's own aggregation (it removes overlaps between apps). */
export function mapDailyTotals(
  metric: HealthMetric,
  totals: readonly DailyTotal[],
  readAt: string,
): DeviceDailyValue[] {
  return totals
    .filter((t) => Number.isFinite(t.value) && t.value > 0)
    .map((t) => {
      const day = localDay(t.startTime);
      return {
        metric,
        day,
        value: Math.round(t.value),
        detail: null,
        recordedAt: readAt,
        sourceIds: [`${metric}-${day}`],
      };
    });
}
