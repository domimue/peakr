import {
  HEALTH_GROUPS as ENGINE_GROUPS,
  HEALTH_METRICS as ENGINE_METRICS,
  METRIC_GROUP as ENGINE_METRIC_GROUP,
} from '@peakr/engine';
import { describe, expect, it } from 'vitest';

import {
  chunks,
  createGarminPersonalHealthApi,
  GARMIN_PERSONAL,
  mapDailySummaries,
  mapHrv,
  mapSleep,
  mapWeight,
  mintPersonalToken,
  tokenUsable,
} from '../../../supabase/functions/_shared/health/garmin-personal.ts';
import { parseHealthPush } from '../../../supabase/functions/_shared/health/garmin-push.ts';
import {
  HEALTH_GROUPS,
  HEALTH_METRICS,
  METRIC_GROUP,
  onlyEnabled,
  type HealthGroup,
} from '../../../supabase/functions/_shared/health/model.ts';
import {
  collectEntries,
  isoTime,
  kg,
  num,
  wallClock,
} from '../../../supabase/functions/_shared/health/parse.ts';
import { createGarminHealthProvider } from '../../../supabase/functions/_shared/health/provider.ts';
import type { Fetch } from '../../../supabase/functions/_shared/watch/http.ts';

const FETCHED = '2026-10-23T08:00:00.000Z';

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
}

interface Call {
  url: string;
  init?: RequestInit;
}

function mockFetch(routes: (url: string) => Response | Promise<Response>): {
  fetch: Fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return routes(url);
    },
  };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('model', () => {
  it('uses the same metric and group names as the engine', () => {
    expect([...HEALTH_METRICS]).toEqual([...ENGINE_METRICS]);
    expect([...HEALTH_GROUPS]).toEqual([...ENGINE_GROUPS]);
    expect(METRIC_GROUP).toEqual(ENGINE_METRIC_GROUP);
  });

  it('drops records of groups that are off', () => {
    const recs = [
      { metric: 'steps' as const, day: '2026-10-22', value: 1, sourceId: 'a', recordedAt: FETCHED },
      {
        metric: 'resting_hr' as const,
        day: '2026-10-22',
        value: 50,
        sourceId: 'a',
        recordedAt: FETCHED,
      },
    ];
    expect(onlyEnabled(recs, new Set<HealthGroup>(['hrv_rhr'])).map((r) => r.metric)).toEqual([
      'resting_hr',
    ]);
  });
});

describe('parse helpers', () => {
  it('reads numbers defensively', () => {
    expect(num('42')).toBe(42);
    expect(num(-1)).toBeNull();
    expect(num(-3600, { allowNegative: true })).toBe(-3600);
    expect(num('x')).toBeNull();
    expect(kg(72500)).toBe(72.5);
    expect(kg(72.46)).toBe(72.5);
    expect(kg(0)).toBeNull();
  });

  it('reads times in seconds, milliseconds and ISO', () => {
    expect(isoTime(1_792_713_600)).toBe('2026-10-23T00:00:00.000Z');
    expect(isoTime(1_792_713_600_000)).toBe('2026-10-23T00:00:00.000Z');
    expect(isoTime('2026-10-23T06:30:00.0')).toBe('2026-10-23T06:30:00.000Z');
    expect(isoTime('2026-10-23T06:30:00+02:00')).toBe('2026-10-23T04:30:00.000Z');
    expect(isoTime('nonsense!!')).toBeNull();
    expect(isoTime(0)).toBeNull();
    expect(wallClock(Date.UTC(2026, 9, 22, 23, 12))).toBe('23:12');
  });

  it('finds entries in arrays, wrappers and single DTOs', () => {
    const days = (b: unknown) => collectEntries(b, ['calendarDate']).map((e) => e.calendarDate);
    expect(days([{ calendarDate: '2026-10-21' }, { calendarDate: '2026-10-22' }])).toEqual([
      '2026-10-21',
      '2026-10-22',
    ]);
    expect(days({ hrvSummaries: [{ calendarDate: '2026-10-22' }] })).toEqual(['2026-10-22']);
    expect(
      days({ dailySleepDTO: { calendarDate: '2026-10-22', nested: { calendarDate: 'x' } } }),
    ).toEqual(['2026-10-22']);
    expect(days(null)).toEqual([]);
  });
});

describe('Personal API token', () => {
  it('exchanges the key for the JWT and reads its expiry', async () => {
    const token = jwt({ exp: 1_792_900_000 });
    const m = mockFetch(() => new Response(`${token}\n`));
    const r = await mintPersonalToken(m.fetch, ' secret-key ');
    expect(r).toEqual({ ok: true, token: { accessToken: token, expiresAt: 1_792_900_000_000 } });
    expect(m.calls[0]?.url).toBe(`${GARMIN_PERSONAL.base}${GARMIN_PERSONAL.tokenPath}`);
    expect(m.calls[0]?.init?.method).toBe('POST');
    expect((m.calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(
      'ApiKey secret-key',
    );
  });

  it('maps failures without exposing anything', async () => {
    const at = async (res: Response | Error) =>
      mintPersonalToken(async () => {
        if (res instanceof Error) throw res;
        return res;
      }, 'k');
    expect(await at(new Response('', { status: 401 }))).toEqual({
      ok: false,
      reason: 'invalid_key',
    });
    expect(await at(new Response('', { status: 429 }))).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    expect(await at(new Response('', { status: 500 }))).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(await at(new Error('offline'))).toEqual({ ok: false, reason: 'unavailable' });
    expect(await at(new Response('opaque'))).toEqual({ ok: false, reason: 'bad_token' });
    expect(await at(new Response(jwt({ sub: 'u' })))).toEqual({ ok: false, reason: 'bad_token' });
    expect(await at(new Response('a.%%%.c'))).toEqual({ ok: false, reason: 'bad_token' });
  });

  it('renews an hour before expiry', () => {
    const t = { accessToken: 'x', expiresAt: 10 * 3_600_000 };
    expect(tokenUsable(t, 8 * 3_600_000)).toBe(true);
    expect(tokenUsable(t, 9.5 * 3_600_000)).toBe(false);
    expect(tokenUsable(null, 0)).toBe(false);
  });
});

// Fixtures in the shape of the Garmin Connect DTOs (field names NOT verified, see garmin-personal.ts).
const SUMMARIES = [
  {
    calendarDate: '2026-10-22',
    totalSteps: 11234,
    floorsAscended: 12,
    moderateIntensityMinutes: 20,
    vigorousIntensityMinutes: 15,
    activeKilocalories: 820,
    restingHeartRate: 48,
    averageStressLevel: -1,
    bodyBatteryHighestValue: 86,
    bodyBatteryLowestValue: 22,
    averageSpo2: 95,
    avgWakingRespirationValue: 14.26,
    lastSyncTimestampGMT: '2026-10-22T21:05:00.0',
  },
  { calendarDate: '2026-10-23', totalSteps: 1200 },
];

const SLEEP = {
  dailySleepDTO: {
    id: 1792790000000,
    calendarDate: '2026-10-23',
    sleepTimeSeconds: 27_000,
    deepSleepSeconds: 5_400,
    lightSleepSeconds: 14_400,
    remSleepSeconds: 6_000,
    awakeSleepSeconds: 1_200,
    sleepStartTimestampGMT: Date.UTC(2026, 9, 22, 21, 12),
    sleepEndTimestampGMT: Date.UTC(2026, 9, 23, 5, 0),
    sleepStartTimestampLocal: Date.UTC(2026, 9, 22, 23, 12),
    sleepEndTimestampLocal: Date.UTC(2026, 9, 23, 7, 0),
    sleepScores: { overall: { value: 81 } },
  },
};

describe('Personal API mappers', () => {
  it('maps daily summaries and skips Garmin sentinels', () => {
    const r = mapDailySummaries(SUMMARIES, FETCHED);
    const day = r.filter((x) => x.day === '2026-10-22');
    expect(Object.fromEntries(day.map((x) => [x.metric, x.value]))).toEqual({
      steps: 11234,
      floors: 12,
      intensity_min: 50,
      active_kcal: 820,
      resting_hr: 48,
      body_battery_high: 86,
      body_battery_low: 22,
      spo2_avg: 95,
      respiration_avg: 14.3,
    });
    expect(day[0]?.recordedAt).toBe('2026-10-22T21:05:00.000Z');
    expect(day[0]?.sourceId).toBe('ds:2026-10-22');
    // No timestamp: the fetch time if it is earlier than the end of that day.
    expect(r.find((x) => x.day === '2026-10-23')?.recordedAt).toBe(FETCHED);
    expect(
      mapDailySummaries([{ calendarDate: '2026-10-20', vigorousIntensityMinutes: 5 }], FETCHED)[0],
    ).toMatchObject({
      metric: 'intensity_min',
      value: 10,
      recordedAt: '2026-10-20T23:59:59.000Z',
    });
  });

  it('maps sleep with stages, score, bed and wake time', () => {
    const r = mapSleep(SLEEP, FETCHED);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({
      metric: 'sleep_duration',
      day: '2026-10-23',
      value: 450,
      sourceId: 'sleep:1792790000000',
      recordedAt: '2026-10-23T05:00:00.000Z',
      detail: {
        deepMin: 90,
        lightMin: 240,
        remMin: 100,
        awakeMin: 20,
        bedTime: '23:12',
        wakeTime: '07:00',
      },
    });
    expect(r[1]).toMatchObject({ metric: 'sleep_score', value: 81 });
    expect(mapSleep([{ calendarDate: '2026-10-21', sleepTimeSeconds: 0 }], FETCHED)).toEqual([]);
    expect(
      mapSleep([{ calendarDate: '2026-10-21', sleepTimeSeconds: 3600, sleepScores: 'x' }], FETCHED),
    ).toHaveLength(1);
  });

  it('maps HRV', () => {
    const r = mapHrv(
      {
        hrvSummaries: [
          {
            calendarDate: '2026-10-23',
            lastNightAvg: 62,
            lastNight5MinHigh: 80,
            createTimeStamp: '2026-10-23T05:10:00.0',
          },
          { calendarDate: '2026-10-22' },
        ],
      },
      FETCHED,
    );
    expect(r).toEqual([
      {
        metric: 'hrv_night',
        day: '2026-10-23',
        value: 62,
        sourceId: 'hrv:2026-10-23',
        recordedAt: '2026-10-23T05:10:00.000Z',
        detail: { fiveMinHigh: 80 },
      },
    ]);
  });

  it('maps the latest scale measurement per day', () => {
    const r = mapWeight(
      {
        dailyWeightSummaries: [
          {
            summaryDate: '2026-10-22',
            allWeightMetrics: [
              { calendarDate: '2026-10-22', samplePk: 1, weight: 73100, timestampGMT: 1000 },
              {
                calendarDate: '2026-10-22',
                samplePk: 2,
                weight: 72800,
                bodyFat: 14.44,
                muscleMass: 34000,
                bmi: 22.04,
                timestampGMT: Date.UTC(2026, 9, 22, 6),
              },
              { calendarDate: '2026-10-22', samplePk: 0, weight: 80000 },
              { calendarDate: '2026-10-21', weight: null },
            ],
          },
        ],
      },
      FETCHED,
    );
    expect(Object.fromEntries(r.map((x) => [x.metric, x.value]))).toEqual({
      weight: 72.8,
      body_fat: 14.4,
      muscle_mass: 34,
      bmi: 22,
    });
    expect(r[0]).toMatchObject({ sourceId: 'weight:2', recordedAt: '2026-10-22T06:00:00.000Z' });
    expect(
      mapWeight([{ calendarDate: '2026-10-20', weight: 70, bodyFat: 0, bmi: 0 }], FETCHED).map(
        (x) => x.metric,
      ),
    ).toEqual(['weight']);
  });
});

describe('Personal API pull', () => {
  it('splits a range into chunks', () => {
    expect(chunks('2026-10-01', '2026-10-16', 7)).toEqual([
      ['2026-10-01', '2026-10-07'],
      ['2026-10-08', '2026-10-14'],
      ['2026-10-15', '2026-10-16'],
    ]);
    expect(chunks('2026-10-02', '2026-10-01', 7)).toEqual([]);
  });

  const route = (url: string): Response => {
    if (url.includes('dailysummaries')) return jsonResponse(SUMMARIES);
    if (url.includes('dailySleepSummariesByDate')) return jsonResponse([SLEEP.dailySleepDTO]);
    if (url.includes('/hrv/daily/')) return new Response('', { status: 404 });
    return jsonResponse({});
  };

  it('calls only the endpoints the enabled groups need, with the bearer token', async () => {
    const m = mockFetch(route);
    const api = createGarminPersonalHealthApi({
      fetch: m.fetch,
      accessToken: 'tok',
      now: () => new Date(FETCHED),
    });
    const r = await api.pull(
      new Set<HealthGroup>(['sleep', 'activity']),
      '2026-10-17',
      '2026-10-23',
    );
    expect(m.calls.map((c) => new URL(c.url).pathname)).toEqual([
      GARMIN_PERSONAL.paths.dailySummaries,
      GARMIN_PERSONAL.paths.sleepSummaries,
    ]);
    expect(new URL(m.calls[0]?.url ?? '').searchParams.get('startDate')).toBe('2026-10-17');
    expect((m.calls[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(r.ok && r.calls).toBe(2);
    // The provider returns everything it parsed; the group filter is applied by the caller.
    expect(r.ok && r.records.some((x) => x.metric === 'sleep_duration')).toBe(true);
  });

  it('treats 404 as "no data" and keeps records inside the requested days', async () => {
    const m = mockFetch(route);
    const api = createGarminPersonalHealthApi({ fetch: m.fetch, accessToken: 'tok' });
    const r = await api.pull(
      new Set<HealthGroup>(['hrv_rhr', 'body_comp']),
      '2026-10-23',
      '2026-10-23',
    );
    expect(r.ok).toBe(true);
    expect(r.ok && r.records.map((x) => x.day)).toEqual(['2026-10-23']);
  });

  it('stops at the first failure', async () => {
    for (const [status, failure] of [
      [429, 'rate_limited'],
      [401, 'not_connected'],
      [500, 'unavailable'],
    ] as const) {
      const m = mockFetch(() => new Response('', { status }));
      const api = createGarminPersonalHealthApi({ fetch: m.fetch, accessToken: 'tok' });
      expect(
        await api.pull(new Set<HealthGroup>(['sleep', 'hrv_rhr']), '2026-10-01', '2026-10-23'),
      ).toEqual({ ok: false, failure, calls: 1 });
    }
  });

  it('probes every endpoint for one day', async () => {
    const m = mockFetch((url) =>
      url.includes('spo2')
        ? new Response('', { status: 403 })
        : jsonResponse({ ok: url.length > 0 }),
    );
    const out = await createGarminPersonalHealthApi({ fetch: m.fetch, accessToken: 'tok' }).probe(
      '2026-10-23',
    );
    expect(Object.keys(out)).toHaveLength(7);
    expect(out.spo2).toEqual({ error: 'not_connected', status: 403 });
    expect(out.hrv).toEqual({ ok: true });
  });
});

describe('GarminHealthProvider', () => {
  const groups = new Set<HealthGroup>(['activity']);

  it('mints a token from the key when none is usable and keeps it', async () => {
    const token = jwt({ exp: 2_000_000_000 });
    const m = mockFetch((url) =>
      url.endsWith(GARMIN_PERSONAL.tokenPath) ? new Response(token) : jsonResponse(SUMMARIES),
    );
    const p = createGarminHealthProvider(
      { mode: 'personal_key', apiKey: 'k' },
      { fetch: m.fetch, now: () => 1_900_000_000_000 },
    );
    expect(p.delivery).toEqual({ mode: 'personal_key', delivery: 'pull', backfillDays: 365 });
    const r = await p.pull(groups, '2026-10-22', '2026-10-22');
    expect(r.ok).toBe(true);
    expect(p.currentToken()).toEqual({ accessToken: token, expiresAt: 2_000_000_000_000 });
    await p.pull(groups, '2026-10-22', '2026-10-22');
    expect(m.calls.filter((c) => c.url.endsWith(GARMIN_PERSONAL.tokenPath))).toHaveLength(1);
  });

  it('reports a rejected or missing key as not connected', async () => {
    const statuses: [number, string][] = [
      [401, 'not_connected'],
      [429, 'rate_limited'],
      [500, 'unavailable'],
    ];
    for (const [status, failure] of statuses) {
      const p = createGarminHealthProvider(
        { mode: 'personal_key', apiKey: 'k' },
        { fetch: async () => new Response('', { status }) },
      );
      expect(await p.pull(groups, '2026-10-22', '2026-10-22')).toEqual({
        ok: false,
        failure,
        calls: 1,
      });
    }
    const none = createGarminHealthProvider(
      { mode: 'personal_key' },
      { fetch: async () => new Response('') },
    );
    expect(await none.pull(groups, '2026-10-22', '2026-10-22')).toEqual({
      ok: false,
      failure: 'not_connected',
      calls: 0,
    });
  });

  it('never pulls on the push-only OAuth tier', async () => {
    const p = createGarminHealthProvider(
      { mode: 'oauth', token: { accessToken: 'a', expiresAt: 1 } },
      { fetch: async () => new Response('') },
    );
    expect(p.delivery.backfillDays).toBe(0);
    expect(await p.pull(groups, '2026-10-22', '2026-10-22')).toEqual({
      ok: false,
      failure: 'unsupported',
      calls: 0,
    });
    expect(p.currentToken()).toEqual({ accessToken: 'a', expiresAt: 1 });
    expect(
      createGarminHealthProvider(
        { mode: 'oauth' },
        { fetch: async () => new Response('') },
      ).currentToken(),
    ).toBeNull();
  });
});

describe('Health API push (Starter, unverified shapes)', () => {
  const T = 1_792_713_600; // 2026-10-23T00:00Z
  it('maps every summary type per Garmin user', () => {
    const p = parseHealthPush(
      {
        dailies: [
          {
            userId: 'g1',
            summaryId: 'd1',
            calendarDate: '2026-10-22',
            steps: 9000,
            floorsClimbed: 4,
            moderateIntensityDurationInSeconds: 1200,
            vigorousIntensityDurationInSeconds: 600,
            activeKilocalories: 500,
            restingHeartRateInBeatsPerMinute: 47,
            averageStressLevel: 30,
            startTimeInSeconds: T - 86400,
            durationInSeconds: 86400,
          },
          { summaryId: 'no-user' },
          'junk',
        ],
        sleeps: [
          {
            userId: 'g1',
            summaryId: 's1',
            calendarDate: '2026-10-23',
            durationInSeconds: 25200,
            startTimeInSeconds: T - 3 * 3600,
            startTimeOffsetInSeconds: 7200,
            deepSleepDurationInSeconds: 3600,
            lightSleepDurationInSeconds: 14400,
            remSleepInSeconds: 5400,
            awakeDurationInSeconds: 1800,
            overallSleepScore: { value: 77 },
          },
          { userId: 'g1', summaryId: 's0', calendarDate: '2026-10-22', durationInSeconds: 0 },
        ],
        hrv: [
          {
            userId: 'g1',
            summaryId: 'h1',
            calendarDate: '2026-10-23',
            lastNightAvg: 58,
            lastNight5MinHigh: 75,
          },
        ],
        bodyComps: [
          {
            userId: 'g2',
            summaryId: 'b1',
            measurementTimeInSeconds: T + 3600,
            measurementTimeOffsetInSeconds: -3600,
            weightInGrams: 81200,
            bodyFatInPercent: 18.25,
            muscleMassInGrams: 38000,
            bmi: 24.4,
          },
        ],
        pulseox: [
          {
            userId: 'g1',
            summaryId: 'p1',
            calendarDate: '2026-10-23',
            timeOffsetSpo2Values: { 0: 96, 60: 94, 120: 'x' },
          },
        ],
        allDayRespiration: [
          {
            userId: 'g1',
            summaryId: 'r1',
            startTimeInSeconds: T,
            timeOffsetEpochToBreaths: { 0: 14, 60: 15 },
          },
        ],
        userMetrics: [
          { userId: 'g1', summaryId: 'u1', calendarDate: '2026-10-23', vo2Max: 52, fitnessAge: 31 },
          { userId: 'g1' },
        ],
        deregistrations: [{ userId: 'g9' }, {}],
        userPermissionsChange: [
          { userId: 'g3', permissions: ['HEALTH_EXPORT', 3] },
          { userId: 'g4' },
          'x',
        ],
      },
      FETCHED,
    );
    const g1 = Object.fromEntries(
      (p.byUser.get('g1') ?? []).map((r) => [`${r.metric}@${r.day}`, r.value]),
    );
    expect(g1).toEqual({
      'steps@2026-10-22': 9000,
      'floors@2026-10-22': 4,
      'intensity_min@2026-10-22': 40,
      'active_kcal@2026-10-22': 500,
      'resting_hr@2026-10-22': 47,
      'stress_avg@2026-10-22': 30,
      'sleep_duration@2026-10-23': 420,
      'sleep_score@2026-10-23': 77,
      'hrv_night@2026-10-23': 58,
      'spo2_avg@2026-10-23': 95,
      'respiration_avg@2026-10-23': 14.5,
      'vo2max@2026-10-23': 52,
      'fitness_age@2026-10-23': 31,
    });
    const sleep = p.byUser.get('g1')?.find((r) => r.metric === 'sleep_duration');
    expect(sleep?.detail).toEqual({
      deepMin: 60,
      lightMin: 240,
      remMin: 90,
      awakeMin: 30,
      bedTime: '23:00',
      wakeTime: '06:00',
    });
    expect(sleep?.recordedAt).toBe('2026-10-23T04:00:00.000Z');
    const g2 = p.byUser.get('g2') ?? [];
    expect(g2.map((r) => [r.metric, r.day, r.value])).toEqual([
      ['weight', '2026-10-23', 81.2],
      ['body_fat', '2026-10-23', 18.3],
      ['muscle_mass', '2026-10-23', 38],
      ['bmi', '2026-10-23', 24.4],
    ]);
    expect(p.deregistered).toEqual(['g9']);
    expect(p.permissions).toEqual(
      new Map([
        ['g3', ['HEALTH_EXPORT']],
        ['g4', []],
      ]),
    );
  });

  it('ignores bodies that are not summaries and entries without a day', () => {
    expect(parseHealthPush('x', FETCHED).byUser.size).toBe(0);
    const p = parseHealthPush(
      {
        dailies: [{ userId: 'g1', steps: 1 }],
        sleeps: [{ userId: 'g1', calendarDate: '2026-10-23', durationInSeconds: 3600 }],
        pulseox: [{ userId: 'g1', calendarDate: '2026-10-23' }],
        bodyComps: [{ userId: 'g1', measurementTimeInSeconds: T }],
      },
      FETCHED,
    );
    expect((p.byUser.get('g1') ?? []).map((r) => r.metric)).toEqual(['sleep_duration']);
    expect(p.byUser.get('g1')?.[0]?.detail).toMatchObject({ bedTime: null, wakeTime: null });
    expect(p.byUser.get('g1')?.[0]?.recordedAt).toBe(FETCHED);
  });
});
