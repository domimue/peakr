import { requestJson, type Fetch } from '../watch/http.ts';
import type { GarminHealthRecord, HealthGroup } from './model.ts';
import {
  collectEntries,
  dayOf,
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
 * Garmin Connect **Personal API** (Personal tier): one person's own data, pull only, a key the
 * user creates in Garmin Connect Web and exchanges for a bearer token.
 *
 * VERIFIED (Garmin's official client github.com/garmin/connect-personal-api-python, 2026): base
 * URL, token endpoint (`Authorization: ApiKey <key>` → the JWT as plain text, expiry in `exp`, no
 * refresh token – a new token is minted from the key) and the endpoint paths in
 * `GARMIN_PERSONAL.paths`. NOT VERIFIED: the JSON field names the mappers read – they follow the
 * Garmin Connect DTO names as publicly known and are read defensively (a missing field gives no
 * value, never a zero). `garmin-health/probe` returns the raw responses for one day so they can
 * be checked against a real account; correcting a field is a change in one mapper below.
 *
 * Terms: the Personal API is meant for a person's own use in their own tools. Peakr therefore
 * offers the key mode only behind the developer flag `GARMIN_PERSONAL_KEY` (see
 * docs/health-garmin.md).
 */

export const GARMIN_PERSONAL = {
  base: 'https://personal.connectapi.garmin.com',
  tokenPath: '/personalapitoken-service/personal-api/personal-api-key/token',
  paths: {
    dailySummaries: '/usersummary-service/v2/dailysummaries',
    sleepSummaries: '/sleep-service/sleep/dailySleepSummariesByDate',
    dailySleep: '/sleep-service/sleep/dailySleep',
    hrvRange: (from: string, to: string) => `/hrv-service/hrv/daily/${from}/${to}`,
    weightRange: (from: string, to: string) => `/weight-service/weight/range/${from}/${to}`,
    spo2Day: (day: string) => `/wellness-service/wellness/daily/spo2acclimation/${day}`,
    bodyBattery: '/wellness-service/wellness/bodyBattery/reports/daily',
  },
  /** Largest range per request Peakr uses (third-party reports: 7 days for some endpoints). */
  chunkDays: 7,
} as const;

/** Refresh the bearer token when less than this is left (Garmin's client uses 1 hour). */
const TOKEN_MARGIN_MS = 3_600_000;

export interface BearerToken {
  accessToken: string;
  /** Epoch milliseconds from the JWT `exp` claim. */
  expiresAt: number;
}

export type TokenResult =
  | { ok: true; token: BearerToken }
  | { ok: false; reason: 'invalid_key' | 'rate_limited' | 'unavailable' | 'bad_token' };

function jwtExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as Json;
    const exp = num(claims.exp);
    return exp === null ? null : exp * 1000;
  } catch {
    return null;
  }
}

/** Exchanges the personal API key for a bearer token. Never logs or returns the key. */
export async function mintPersonalToken(
  fetchImpl: Fetch,
  apiKey: string,
  base: string = GARMIN_PERSONAL.base,
): Promise<TokenResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${base}${GARMIN_PERSONAL.tokenPath}`, {
      method: 'POST',
      headers: { Accept: '*/*', Authorization: `ApiKey ${apiKey.trim()}` },
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (response.status === 401 || response.status === 403)
    return { ok: false, reason: 'invalid_key' };
  if (response.status === 429) return { ok: false, reason: 'rate_limited' };
  if (!response.ok) return { ok: false, reason: 'unavailable' };
  const accessToken = (await response.text()).trim();
  const expiresAt = jwtExpiry(accessToken);
  if (!expiresAt) return { ok: false, reason: 'bad_token' };
  return { ok: true, token: { accessToken, expiresAt } };
}

export function tokenUsable(token: BearerToken | null, now: number): token is BearerToken {
  return !!token && token.expiresAt - now > TOKEN_MARGIN_MS;
}

// ---------------------------------------------------------------------------------------------
// Mappers: one per endpoint, response → records. Exported for the contract tests.

const DAY_KEYS = ['calendarDate', 'summaryDate', 'date'] as const;

function recorded(entry: Json, day: string, fetchedAt: string, keys: readonly string[]): string {
  for (const k of keys) {
    const t = isoTime(entry[k]);
    if (t) return t;
  }
  // No recording time in the payload: the end of that day is the honest upper bound.
  return fetchedAt < `${day}T23:59:59.000Z` ? fetchedAt : `${day}T23:59:59.000Z`;
}

/** Daily summaries ("My Day"): activity, resting HR, stress, Body Battery, SpO2, respiration. */
export function mapDailySummaries(body: unknown, fetchedAt: string): GarminHealthRecord[] {
  const sink = new RecordSink();
  for (const e of collectEntries(body, DAY_KEYS)) {
    const day = dayOf(e, DAY_KEYS) as string;
    const id = `ds:${day}`;
    const at = recorded(e, day, fetchedAt, ['lastSyncTimestampGMT', 'wellnessEndTimeGmt']);
    sink.add('steps', day, num(e.totalSteps), id, at);
    sink.add('floors', day, num(e.floorsAscended), id, at);
    const moderate = num(e.moderateIntensityMinutes);
    const vigorous = num(e.vigorousIntensityMinutes);
    if (moderate !== null || vigorous !== null) {
      // Garmin counts vigorous minutes double in its intensity-minutes total.
      sink.add('intensity_min', day, (moderate ?? 0) + 2 * (vigorous ?? 0), id, at, {
        moderate,
        vigorous,
      });
    }
    sink.add('active_kcal', day, num(e.activeKilocalories), id, at);
    sink.add('resting_kcal', day, num(e.bmrKilocalories), id, at);
    sink.add('resting_hr', day, num(e.restingHeartRate), id, at);
    sink.add('stress_avg', day, num(e.averageStressLevel), id, at);
    sink.add('body_battery_high', day, num(e.bodyBatteryHighestValue), id, at);
    sink.add('body_battery_low', day, num(e.bodyBatteryLowestValue), id, at);
    sink.add('spo2_avg', day, num(e.averageSpo2), id, at);
    const resp = num(e.avgWakingRespirationValue);
    sink.add('respiration_avg', day, resp === null ? null : round1(resp), id, at);
  }
  return sink.records;
}

/** Sleep: duration, stages, score, bed and wake time. Accepts summaries or the per-day DTO. */
export function mapSleep(body: unknown, fetchedAt: string): GarminHealthRecord[] {
  const sink = new RecordSink();
  for (const e of collectEntries(body, DAY_KEYS, (o) => 'sleepTimeSeconds' in o)) {
    const total = minutes(e.sleepTimeSeconds);
    if (total === null || total === 0) continue;
    const day = dayOf(e, DAY_KEYS) as string;
    const id = `sleep:${str(e.id) ?? num(e.id) ?? day}`;
    const at = recorded(e, day, fetchedAt, ['sleepEndTimestampGMT', 'sleepStartTimestampGMT']);
    const detail = {
      deepMin: minutes(e.deepSleepSeconds),
      lightMin: minutes(e.lightSleepSeconds),
      remMin: minutes(e.remSleepSeconds),
      awakeMin: minutes(e.awakeSleepSeconds),
      bedTime: wallClock(e.sleepStartTimestampLocal),
      wakeTime: wallClock(e.sleepEndTimestampLocal),
    };
    sink.add('sleep_duration', day, total, id, at, detail);
    const scores = e.sleepScores as Json | undefined;
    const overall =
      scores && typeof scores === 'object' ? (scores.overall as Json | undefined) : undefined;
    sink.add('sleep_score', day, num(overall?.value), id, at);
  }
  return sink.records;
}

/** Overnight HRV (average of the night, ms). Garmin's own "status" label is not used. */
export function mapHrv(body: unknown, fetchedAt: string): GarminHealthRecord[] {
  const sink = new RecordSink();
  for (const e of collectEntries(body, DAY_KEYS, (o) => 'lastNightAvg' in o)) {
    const day = dayOf(e, DAY_KEYS) as string;
    const at = recorded(e, day, fetchedAt, ['createTimeStamp', 'endTimestampGMT']);
    sink.add('hrv_night', day, num(e.lastNightAvg), `hrv:${day}`, at, {
      fiveMinHigh: num(e.lastNight5MinHigh),
    });
  }
  return sink.records;
}

/** Scale measurements: the latest one per day. */
export function mapWeight(body: unknown, fetchedAt: string): GarminHealthRecord[] {
  const sink = new RecordSink();
  const latest = new Map<string, Json>();
  for (const e of collectEntries(body, DAY_KEYS, (o) => 'weight' in o)) {
    if (kg(e.weight) === null) continue;
    const day = dayOf(e, DAY_KEYS) as string;
    const prev = latest.get(day);
    if (!prev || (num(e.timestampGMT) ?? 0) >= (num(prev.timestampGMT) ?? 0)) latest.set(day, e);
  }
  for (const [day, e] of latest) {
    const id = `weight:${str(e.samplePk) ?? num(e.samplePk) ?? day}`;
    const at = recorded(e, day, fetchedAt, ['timestampGMT', 'date']);
    sink.add('weight', day, kg(e.weight), id, at);
    const fat = num(e.bodyFat);
    sink.add('body_fat', day, fat === null || fat === 0 ? null : round1(fat), id, at);
    sink.add('muscle_mass', day, kg(e.muscleMass), id, at);
    const bmi = num(e.bmi);
    sink.add('bmi', day, bmi === null || bmi === 0 ? null : round1(bmi), id, at);
  }
  return sink.records;
}

// ---------------------------------------------------------------------------------------------
// Client

export type PullFailure = 'not_connected' | 'rate_limited' | 'unavailable';

export type PullResult =
  | { ok: true; records: GarminHealthRecord[]; calls: number }
  | { ok: false; failure: PullFailure; calls: number };

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inclusive day ranges of at most `size` days from `from` to `to`. */
export function chunks(from: string, to: string, size: number): [string, string][] {
  const out: [string, string][] = [];
  for (let start = from; start <= to; start = addDays(start, size)) {
    const end = addDays(start, size - 1);
    out.push([start, end < to ? end : to]);
  }
  return out;
}

export interface PersonalClientOptions {
  fetch: Fetch;
  accessToken: string;
  base?: string;
  now?: () => Date;
}

/** Which requests a set of groups needs; groups no endpoint provides cost nothing. */
function needs(groups: ReadonlySet<HealthGroup>) {
  return {
    summaries: ['hrv_rhr', 'stress', 'activity', 'spo2_resp'].some((g) =>
      groups.has(g as HealthGroup),
    ),
    sleep: groups.has('sleep'),
    hrv: groups.has('hrv_rhr'),
    weight: groups.has('body_comp'),
  };
}

export function createGarminPersonalHealthApi(o: PersonalClientOptions) {
  const base = o.base ?? GARMIN_PERSONAL.base;
  const now = o.now ?? (() => new Date());
  const get = (path: string, query: Record<string, string> = {}) => {
    const qs = new URLSearchParams(query).toString();
    return requestJson<unknown>(o.fetch, `${base}${path}${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${o.accessToken}` },
    });
  };

  return {
    /** Raw responses for one day, for checking field names against a real account (dev only). */
    async probe(day: string): Promise<Record<string, unknown>> {
      const p = GARMIN_PERSONAL.paths;
      const calls: Record<string, Promise<unknown>> = {
        dailySummaries: get(p.dailySummaries, { startDate: day, endDate: day }),
        sleepSummaries: get(p.sleepSummaries, { startDate: day, endDate: day }),
        dailySleep: get(p.dailySleep, { date: day }),
        hrv: get(p.hrvRange(day, day)),
        weight: get(p.weightRange(day, day), { includeAll: 'true' }),
        spo2: get(p.spo2Day(day)),
        bodyBattery: get(p.bodyBattery, { startDate: day, endDate: day }),
      };
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(calls)) {
        const r = (await v) as Awaited<ReturnType<typeof get>>;
        out[k] = r.ok ? r.body : { error: r.failure, status: r.status };
      }
      return out;
    },

    /**
     * All enabled groups for `from`…`to` (inclusive), in chunks of `chunkDays`. Stops at the
     * first failure so a rate limit is not hammered; what was fetched before is still returned
     * by the caller's next run (the window overlaps).
     */
    async pull(groups: ReadonlySet<HealthGroup>, from: string, to: string): Promise<PullResult> {
      const want = needs(groups);
      const p = GARMIN_PERSONAL.paths;
      const records: GarminHealthRecord[] = [];
      let calls = 0;
      for (const [start, end] of chunks(from, to, GARMIN_PERSONAL.chunkDays)) {
        const fetchedAt = now().toISOString();
        const jobs: [
          boolean,
          () => ReturnType<typeof get>,
          (b: unknown, t: string) => GarminHealthRecord[],
        ][] = [
          [
            want.summaries,
            () => get(p.dailySummaries, { startDate: start, endDate: end }),
            mapDailySummaries,
          ],
          [want.sleep, () => get(p.sleepSummaries, { startDate: start, endDate: end }), mapSleep],
          [want.hrv, () => get(p.hrvRange(start, end)), mapHrv],
          [want.weight, () => get(p.weightRange(start, end), { includeAll: 'true' }), mapWeight],
        ];
        for (const [on, call, map] of jobs) {
          if (!on) continue;
          calls++;
          const r = await call();
          if (!r.ok) {
            // 404 for a range without data is not an error.
            if (r.status === 404 || r.status === 204) continue;
            const failure: PullFailure =
              r.failure === 'not_connected'
                ? 'not_connected'
                : r.failure === 'rate_limited'
                  ? 'rate_limited'
                  : 'unavailable';
            return { ok: false, failure, calls };
          }
          records.push(...map(r.body, fetchedAt).filter((x) => x.day >= start && x.day <= end));
        }
      }
      return { ok: true, records, calls };
    },
  };
}

export type GarminPersonalHealthApi = ReturnType<typeof createGarminPersonalHealthApi>;
