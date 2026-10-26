import type { GarminHealthRecord } from './model.ts';
import {
  isObject,
  isoDay,
  isoTime,
  kg,
  minutes,
  num,
  RecordSink,
  round1,
  str,
  wallClock,
  type Json,
} from './parse.ts';

/**
 * Garmin **Health API** push notifications (Starter tier, OAuth). Garmin POSTs JSON summaries to
 * one callback URL per summary type after the user's watch syncs; there is no pull and, per the
 * public descriptions of the Starter tier, no backfill of data from before the connection.
 *
 * NOT VERIFIED: the Health API reference sits behind the developer-portal login. Summary type
 * names and field names below follow Garmin's published Health API specification as quoted by
 * public integrations; they live in `GARMIN_HEALTH` and the mappers here, so confirming them is a
 * change in this file and its contract test only. Switched on with `GARMIN_HEALTH=1`.
 */

export const GARMIN_HEALTH = {
  /** Summary types Peakr registers a callback for, and the array key in each push body. */
  summaryTypes: [
    'dailies',
    'sleeps',
    'hrv',
    'bodyComps',
    'pulseox',
    'allDayRespiration',
    'userMetrics',
  ] as const,
  /** Deregistration and permission changes come as their own notifications. */
  deregistrations: 'deregistrations',
  permissionChanges: 'userPermissionsChange',
} as const;

export type GarminSummaryType = (typeof GARMIN_HEALTH.summaryTypes)[number];

export interface ParsedHealthPush {
  /** Records per Garmin user id. */
  byUser: Map<string, GarminHealthRecord[]>;
  deregistered: string[];
  /** Garmin user id → permissions the user still grants (e.g. HEALTH_EXPORT). */
  permissions: Map<string, string[]>;
}

/** Day from `calendarDate`, else from the start time plus the user's UTC offset. */
function dayOf(e: Json): string | null {
  const d = isoDay(e.calendarDate);
  if (d) return d;
  const start = num(e.startTimeInSeconds ?? e.measurementTimeInSeconds);
  if (start === null) return null;
  const offset =
    num(e.startTimeOffsetInSeconds ?? e.measurementTimeOffsetInSeconds, { allowNegative: true }) ??
    0;
  return new Date((start + offset) * 1000).toISOString().slice(0, 10);
}

function endTime(e: Json): string | null {
  const start = num(e.startTimeInSeconds ?? e.measurementTimeInSeconds);
  if (start === null) return null;
  return isoTime(start + (num(e.durationInSeconds) ?? 0));
}

function averageOf(map: unknown): number | null {
  if (!isObject(map)) return null;
  const values = Object.values(map)
    .map((v) => num(v))
    .filter((v): v is number => v !== null);
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

function mapSummary(type: GarminSummaryType, e: Json, receivedAt: string, sink: RecordSink): void {
  const day = dayOf(e);
  if (!day) return;
  const id = `${type}:${str(e.summaryId) ?? day}`;
  const at = endTime(e) ?? receivedAt;
  switch (type) {
    case 'dailies': {
      sink.add('steps', day, num(e.steps), id, at);
      sink.add('floors', day, num(e.floorsClimbed), id, at);
      const moderate = minutes(e.moderateIntensityDurationInSeconds);
      const vigorous = minutes(e.vigorousIntensityDurationInSeconds);
      if (moderate !== null || vigorous !== null) {
        sink.add('intensity_min', day, (moderate ?? 0) + 2 * (vigorous ?? 0), id, at, {
          moderate,
          vigorous,
        });
      }
      sink.add('active_kcal', day, num(e.activeKilocalories), id, at);
      // Garmin's own resting energy (BMR) – the Body add-on prefers it to the formula.
      sink.add('resting_kcal', day, num(e.bmrKilocalories), id, at);
      sink.add('resting_hr', day, num(e.restingHeartRateInBeatsPerMinute), id, at);
      sink.add('stress_avg', day, num(e.averageStressLevel), id, at);
      return;
    }
    case 'sleeps': {
      const total = minutes(e.durationInSeconds);
      if (!total) return;
      const offset = num(e.startTimeOffsetInSeconds, { allowNegative: true }) ?? 0;
      const start = num(e.startTimeInSeconds);
      const detail = {
        deepMin: minutes(e.deepSleepDurationInSeconds),
        lightMin: minutes(e.lightSleepDurationInSeconds),
        remMin: minutes(e.remSleepInSeconds),
        awakeMin: minutes(e.awakeDurationInSeconds),
        bedTime: start === null ? null : wallClock(start + offset),
        wakeTime:
          start === null ? null : wallClock(start + offset + (num(e.durationInSeconds) ?? 0)),
      };
      sink.add('sleep_duration', day, total, id, at, detail);
      const score = e.overallSleepScore;
      sink.add('sleep_score', day, isObject(score) ? num(score.value) : null, id, at);
      return;
    }
    case 'hrv':
      sink.add('hrv_night', day, num(e.lastNightAvg), id, at, {
        fiveMinHigh: num(e.lastNight5MinHigh),
      });
      return;
    case 'bodyComps': {
      sink.add('weight', day, kg(e.weightInGrams), id, at);
      const fat = num(e.bodyFatInPercent);
      sink.add('body_fat', day, fat ? round1(fat) : null, id, at);
      sink.add('muscle_mass', day, kg(e.muscleMassInGrams), id, at);
      const bmi = num(e.bmi);
      sink.add('bmi', day, bmi ? round1(bmi) : null, id, at);
      return;
    }
    case 'pulseox': {
      const avg = averageOf(e.timeOffsetSpo2Values);
      sink.add('spo2_avg', day, avg === null ? null : Math.round(avg), id, at);
      return;
    }
    case 'allDayRespiration': {
      const avg = averageOf(e.timeOffsetEpochToBreaths);
      sink.add('respiration_avg', day, avg === null ? null : round1(avg), id, at);
      return;
    }
    case 'userMetrics':
      sink.add('vo2max', day, num(e.vo2Max), id, at);
      sink.add('fitness_age', day, num(e.fitnessAge), id, at);
      return;
  }
}

export function isSummaryType(v: string): v is GarminSummaryType {
  return (GARMIN_HEALTH.summaryTypes as readonly string[]).includes(v);
}

/** Parses one push body (any summary type, deregistrations, permission changes). */
export function parseHealthPush(body: unknown, receivedAt: string): ParsedHealthPush {
  const out: ParsedHealthPush = { byUser: new Map(), deregistered: [], permissions: new Map() };
  if (!isObject(body)) return out;
  for (const type of GARMIN_HEALTH.summaryTypes) {
    const list = body[type];
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      if (!isObject(e)) continue;
      const userId = str(e.userId);
      if (!userId) continue;
      const sink = new RecordSink();
      mapSummary(type, e, receivedAt, sink);
      const prev = out.byUser.get(userId) ?? [];
      out.byUser.set(userId, prev.concat(sink.records));
    }
  }
  const dereg = body[GARMIN_HEALTH.deregistrations];
  if (Array.isArray(dereg)) {
    for (const e of dereg) {
      const id = isObject(e) ? str(e.userId) : null;
      if (id) out.deregistered.push(id);
    }
  }
  const perms = body[GARMIN_HEALTH.permissionChanges];
  if (Array.isArray(perms)) {
    for (const e of perms) {
      if (!isObject(e)) continue;
      const id = str(e.userId);
      if (id)
        out.permissions.set(
          id,
          Array.isArray(e.permissions)
            ? e.permissions.filter((p): p is string => typeof p === 'string')
            : [],
        );
    }
  }
  return out;
}
