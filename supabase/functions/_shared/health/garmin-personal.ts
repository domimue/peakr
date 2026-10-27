import { requestJson, type Fetch } from '../watch/http.ts';
import type { GarminHealthRecord, HealthGroup } from './model.ts';
import {
  collectEntries,
  dayOf,
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
 * Garmin Connect **Personal API** (Personal tier): one person's own data, pull only, a key the
 * user creates in Garmin Connect Web and exchanges for a bearer token.
 *
 * VERIFIED (Garmin's official client github.com/garmin/connect-personal-api-python, 2026): base
 * URL, token endpoint (`Authorization: ApiKey <key>` → the JWT as plain text, expiry in `exp`, no
 * refresh token – a new token is minted from the key) and the endpoint paths in
 * `GARMIN_PERSONAL.paths`. Response shapes and field names follow Garmin's Personal API OpenAPI
 * spec 1.0.0 (developer.garmin.com/gc-developer-program/personal/swagger-docs/, read through the
 * types generated from it in github.com/DynamicsNinja/garminconnect-js, checked there against a
 * real account on 2026-10-23). Still read defensively (a missing field gives no value, never a
 * zero). `garmin-health/probe` returns the raw responses for one day; correcting a field is a
 * change in one mapper below.
 *
 * Not in the Personal API at all (so "not provided" in the app, never recalculated): a daily
 * VO2max (only Garmin's per-activity `vO2MaxValue`, read below), Training Readiness, Training
 * Status, skin temperature. Respiration and body composition have no endpoint of their own here –
 * they come from the daily summary and the weight range.
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
    activities: '/activitylist-service/activities/search/activities',
  },
  /** Activities per page; a 7-day chunk holds far fewer. */
  activityPage: 100,
  /** Largest range per request Peakr uses (third-party reports: 7 days for some endpoints). */
  chunkDays: 7,
} as const;

/**
 * Version of the mappers below. Raise it whenever a mapper reads a field it did not read before:
 * the next pull then fetches the user's history again (`garmin-health` → `pullFor`).
 * 2: daily summaries in the v2 shape, SpO2 per day, VO2max from activities.
 */
export const PARSER_VERSION = 2;

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

/** The value at a path of nested objects, or undefined. */
function at(e: Json, ...path: string[]): unknown {
  let v: unknown = e;
  for (const k of path) {
    if (!isObject(v)) return undefined;
    v = v[k];
  }
  return v;
}

/** The first of several readings that is a usable number (v2 nested field, then the v1 name). */
function first(...values: unknown[]): number | null {
  for (const v of values) {
    const n = num(v);
    if (n !== null) return n;
  }
  return null;
}

/**
 * Daily summaries: activity, resting HR, stress, Body Battery, SpO2, respiration.
 *
 * `/usersummary-service/v2/dailysummaries` answers `{ data: [UserDailySummaryV2DTO] }` with the
 * values grouped by topic (`movement.steps.value`, `heartRate.restingValue`, `stress.avgLevel`,
 * `bodyBattery.maxValue`, `pulseOx.avgValue`, `respiration.avgValue` …; Personal API spec 1.0.0).
 * The flat names of the older `usersummary/daily` DTO (`totalSteps`, `restingHeartRate` …) are
 * read as a fallback, so a day in either shape gives its values.
 */
export function mapDailySummaries(body: unknown, fetchedAt: string): GarminHealthRecord[] {
  const sink = new RecordSink();
  for (const e of collectEntries(body, DAY_KEYS)) {
    const day = dayOf(e, DAY_KEYS) as string;
    const id = `ds:${day}`;
    const end = isoTime(at(e, 'wellnessChronology', 'endTimestampGmt'));
    const found =
      end ?? recorded(e, day, fetchedAt, ['lastSyncTimestampGMT', 'wellnessEndTimeGmt']);
    // The end of today's wellness window lies in the future; a value is never newer than its fetch.
    const t = found < fetchedAt ? found : fetchedAt;
    sink.add('steps', day, first(at(e, 'movement', 'steps', 'value'), e.totalSteps), id, t);
    sink.add(
      'floors',
      day,
      first(at(e, 'movement', 'floorsAscended', 'value'), e.floorsAscended),
      id,
      t,
    );
    const moderate = first(at(e, 'intensityMinutes', 'moderate'), e.moderateIntensityMinutes);
    const vigorous = first(at(e, 'intensityMinutes', 'vigorous'), e.vigorousIntensityMinutes);
    if (moderate !== null || vigorous !== null) {
      // Garmin counts vigorous minutes double in its intensity-minutes total.
      sink.add('intensity_min', day, (moderate ?? 0) + 2 * (vigorous ?? 0), id, t, {
        moderate,
        vigorous,
      });
    }
    sink.add(
      'active_kcal',
      day,
      first(at(e, 'calories', 'burnedActive'), e.activeKilocalories),
      id,
      t,
    );
    sink.add(
      'resting_kcal',
      day,
      first(at(e, 'calories', 'burnedResting'), e.bmrKilocalories),
      id,
      t,
    );
    sink.add(
      'resting_hr',
      day,
      first(at(e, 'heartRate', 'restingValue'), e.restingHeartRate),
      id,
      t,
    );
    sink.add('stress_avg', day, first(at(e, 'stress', 'avgLevel'), e.averageStressLevel), id, t);
    sink.add(
      'body_battery_high',
      day,
      first(at(e, 'bodyBattery', 'maxValue'), e.bodyBatteryHighestValue),
      id,
      t,
    );
    sink.add(
      'body_battery_low',
      day,
      first(at(e, 'bodyBattery', 'minValue'), e.bodyBatteryLowestValue),
      id,
      t,
    );
    sink.add('spo2_avg', day, first(at(e, 'pulseOx', 'avgValue'), e.averageSpo2), id, t);
    const resp = first(at(e, 'respiration', 'avgValue'), e.avgWakingRespirationValue);
    sink.add('respiration_avg', day, resp === null ? null : round1(resp), id, t);
  }
  return sink.records;
}

/** One day of `spo2acclimation/{day}`: the day's average (`averageSpO2`). */
export function mapSpo2Day(body: unknown, fetchedAt: string): GarminHealthRecord[] {
  const sink = new RecordSink();
  for (const e of collectEntries(body, DAY_KEYS, (o) => 'averageSpO2' in o)) {
    const day = dayOf(e, DAY_KEYS) as string;
    const t = recorded(e, day, fetchedAt, ['latestSpO2TimestampGMT', 'endTimestampGMT']);
    sink.add('spo2_avg', day, num(e.averageSpO2), `spo2:${day}`, t < fetchedAt ? t : fetchedAt);
  }
  return sink.records;
}

/**
 * Garmin's own VO2max estimate (`vO2MaxValue`) from the activity list – the Personal API has no
 * daily VO2max. One value per day: the latest activity of that day that carries one. Nothing is
 * calculated here; the activities themselves are not stored.
 */
export function mapActivityVo2max(body: unknown, fetchedAt: string): GarminHealthRecord[] {
  const sink = new RecordSink();
  const latest = new Map<string, Json>();
  const list = Array.isArray(body) ? body : [];
  for (const e of list) {
    if (!isObject(e) || num(e.vO2MaxValue) === null) continue;
    const day = isoDay(e.startTimeLocal);
    if (!day) continue;
    const prev = latest.get(day);
    if (!prev || String(e.startTimeLocal) >= String(prev.startTimeLocal)) latest.set(day, e);
  }
  for (const [day, e] of latest) {
    const id = `vo2:${str(e.activityId) ?? num(e.activityId) ?? day}`;
    const t = isoTime(e.startTimeGMT) ?? recorded(e, day, fetchedAt, []);
    sink.add('vo2max', day, num(e.vO2MaxValue), id, t < fetchedAt ? t : fetchedAt, {
      activityId: num(e.activityId) ?? str(e.activityId),
      activityName: str(e.activityName),
      activityType: str(at(e, 'activityType', 'typeKey')),
    });
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

/** The endpoints a pull calls, as named in the diagnostics. */
export const PULL_ENDPOINTS = [
  'dailySummaries',
  'sleepSummaries',
  'hrv',
  'weight',
  'spo2Day',
  'activities',
] as const;
export type PullEndpoint = (typeof PULL_ENDPOINTS)[number];

/** Last call of one endpoint in a pull. `error` is the kind of failure, never Garmin's text. */
export interface EndpointStat {
  at: string;
  status: number;
  records: number;
  calls: number;
  error: string | null;
}
export type EndpointStats = Partial<Record<PullEndpoint, EndpointStat>>;

export type PullFailure = 'not_connected' | 'rate_limited' | 'unavailable';

/**
 * `ok: false` means the pull stopped early (key rejected, rate limit); what it fetched before is
 * still in `records`. `partial` reports an endpoint that failed while the others went on.
 */
export type PullResult =
  | {
      ok: true;
      records: GarminHealthRecord[];
      calls: number;
      endpoints: EndpointStats;
      partial: PullFailure | null;
    }
  | {
      ok: false;
      failure: PullFailure;
      calls: number;
      records: GarminHealthRecord[];
      endpoints: EndpointStats;
    };

export interface PullOptions {
  /**
   * Ask `spo2acclimation/{day}` for the days whose summary had no SpO2. One call per day, so only
   * for the recent window, never during the backfill.
   */
  spo2Fallback?: boolean;
}

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
function needs(groups: ReadonlySet<HealthGroup>): Record<PullEndpoint, boolean> {
  return {
    dailySummaries: ['hrv_rhr', 'stress', 'activity', 'spo2_resp'].some((g) =>
      groups.has(g as HealthGroup),
    ),
    sleepSummaries: groups.has('sleep'),
    hrv: groups.has('hrv_rhr'),
    weight: groups.has('body_comp'),
    spo2Day: groups.has('spo2_resp'),
    activities: groups.has('activity'),
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
  const p = GARMIN_PERSONAL.paths;
  const range = (endpoint: Exclude<PullEndpoint, 'spo2Day'>, start: string, end: string) => {
    switch (endpoint) {
      case 'dailySummaries':
        return get(p.dailySummaries, { startDate: start, endDate: end });
      case 'sleepSummaries':
        return get(p.sleepSummaries, { startDate: start, endDate: end });
      case 'hrv':
        return get(p.hrvRange(start, end));
      case 'weight':
        return get(p.weightRange(start, end), { includeAll: 'true' });
      case 'activities':
        return get(p.activities, {
          startDate: start,
          endDate: end,
          start: '0',
          limit: String(GARMIN_PERSONAL.activityPage),
        });
    }
  };
  const MAP: Record<PullEndpoint, (b: unknown, t: string) => GarminHealthRecord[]> = {
    dailySummaries: mapDailySummaries,
    sleepSummaries: mapSleep,
    hrv: mapHrv,
    weight: mapWeight,
    spo2Day: mapSpo2Day,
    activities: mapActivityVo2max,
  };

  return {
    /** Raw responses for one day, for checking field names against a real account (dev only). */
    async probe(day: string): Promise<Record<string, unknown>> {
      const calls: Record<string, Promise<unknown>> = {
        dailySummaries: get(p.dailySummaries, { startDate: day, endDate: day }),
        sleepSummaries: get(p.sleepSummaries, { startDate: day, endDate: day }),
        dailySleep: get(p.dailySleep, { date: day }),
        hrv: get(p.hrvRange(day, day)),
        weight: get(p.weightRange(day, day), { includeAll: 'true' }),
        spo2: get(p.spo2Day(day)),
        bodyBattery: get(p.bodyBattery, { startDate: day, endDate: day }),
        activities: get(p.activities, { startDate: day, endDate: day, start: '0', limit: '20' }),
      };
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(calls)) {
        const r = (await v) as Awaited<ReturnType<typeof get>>;
        out[k] = r.ok ? r.body : { error: r.failure, status: r.status };
      }
      return out;
    },

    /**
     * All enabled groups for `from`…`to` (inclusive), in chunks of `chunkDays`, endpoint by
     * endpoint. A rejected key or a rate limit stops the pull (so Garmin is not hammered); any
     * other failure is noted for that endpoint and the others go on. 404/204 mean "no data".
     */
    async pull(
      groups: ReadonlySet<HealthGroup>,
      from: string,
      to: string,
      options: PullOptions = {},
    ): Promise<PullResult> {
      const want = needs(groups);
      const records: GarminHealthRecord[] = [];
      const endpoints: EndpointStats = {};
      let calls = 0;
      let partial: PullFailure | null = null;
      const today = now().toISOString().slice(0, 10);

      /** One request; returns the failure that stops the pull, if any. */
      const call = async (
        endpoint: PullEndpoint,
        request: () => ReturnType<typeof get>,
        start: string,
        end: string,
      ): Promise<PullFailure | null> => {
        const fetchedAt = now().toISOString();
        calls++;
        const r = await request();
        const prev = endpoints[endpoint];
        const stat: EndpointStat = {
          at: fetchedAt,
          status: r.status,
          records: prev?.records ?? 0,
          calls: (prev?.calls ?? 0) + 1,
          error: prev?.error ?? null,
        };
        endpoints[endpoint] = stat;
        if (!r.ok) {
          if (r.status === 404 || r.status === 204) return null;
          stat.error = r.failure;
          if (r.failure === 'not_connected' || r.failure === 'rate_limited') return r.failure;
          partial = 'unavailable';
          return null;
        }
        const found = MAP[endpoint](r.body, fetchedAt).filter(
          (x) => x.day >= start && x.day <= end,
        );
        stat.records += found.length;
        records.push(...found);
        return null;
      };

      for (const [start, end] of chunks(from, to, GARMIN_PERSONAL.chunkDays)) {
        for (const endpoint of PULL_ENDPOINTS) {
          if (!want[endpoint] || endpoint === 'spo2Day') continue;
          const stop = await call(endpoint, () => range(endpoint, start, end), start, end);
          if (stop) return { ok: false, failure: stop, calls, records, endpoints };
        }
        if (options.spo2Fallback && want.spo2Day) {
          const have = new Set(records.filter((x) => x.metric === 'spo2_avg').map((x) => x.day));
          for (const [day] of chunks(start, end < today ? end : today, 1)) {
            if (have.has(day)) continue;
            const stop = await call('spo2Day', () => get(p.spo2Day(day)), day, day);
            if (stop) return { ok: false, failure: stop, calls, records, endpoints };
          }
        }
      }
      return { ok: true, records, calls, endpoints, partial };
    },
  };
}

export type GarminPersonalHealthApi = ReturnType<typeof createGarminPersonalHealthApi>;
