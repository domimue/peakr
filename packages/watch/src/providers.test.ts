import { Encoder, Profile } from '@garmin/fitsdk';
import { describe, expect, it } from 'vitest';

import { activityFromFit, buildActivityRow } from '../../../supabase/functions/_shared/watch/activity-map.ts';
import {
  createCorosApi,
  corosPlanEntity,
  importCorosActivities,
  syncCorosPlan,
} from '../../../supabase/functions/_shared/watch/coros.ts';
import { flagEnabled } from '../../../supabase/functions/_shared/watch/flags.ts';
import {
  createGarminCoursesApi,
  createGarminTrainingApi,
  garminCoursePayload,
  garminWorkoutPayload,
  parseGarminPush,
  publishGarminCourse,
  syncGarminWorkouts,
} from '../../../supabase/functions/_shared/watch/garmin.ts';
import { requestJson, type Fetch } from '../../../supabase/functions/_shared/watch/http.ts';
import type {
  WatchRoute,
  WatchWorkout,
} from '../../../supabase/functions/_shared/watch/model.ts';
import {
  createSuuntoApi,
  importSuuntoWorkout,
  parseSuuntoNotification,
  verifySuuntoSignature,
} from '../../../supabase/functions/_shared/watch/suunto.ts';
import {
  inWindow,
  planSync,
  workoutHash,
  type PushedRecord,
} from '../../../supabase/functions/_shared/watch/sync.ts';

// ---------------------------------------------------------------------------------------------
// A mocked platform: records every request and answers from a route table.

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}
type Handler = (call: Call) => Response | Promise<Response>;

function mockApi(handlers: Record<string, Handler>) {
  const calls: Call[] = [];
  const fetchMock: Fetch = async (input, init) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: input,
      headers: (init?.headers as Record<string, string> | undefined) ?? {},
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    const url = new URL(input);
    const key = `${call.method} ${url.pathname}`;
    const handler = handlers[key];
    return handler ? handler(call) : new Response('not found', { status: 404 });
  };
  return { fetch: fetchMock, calls };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const run = (id: string, date: string, extra: Partial<WatchWorkout> = {}): WatchWorkout => ({
  id,
  date,
  name: `Run ${id}`,
  sport: 'run',
  steps: [
    {
      kind: 'step',
      intensity: 'warmup',
      durationSec: 600,
      target: { type: 'heartRate', lowBpm: 120, highBpm: 140 },
    },
    {
      kind: 'repeat',
      count: 4,
      steps: [
        {
          kind: 'step',
          intensity: 'interval',
          distanceM: 400,
          target: { type: 'pace', fastestSecPerKm: 240, slowestSecPerKm: 250 },
        },
        { kind: 'step', intensity: 'recovery', durationSec: 60, target: { type: 'open' } },
      ],
    },
  ],
  ...extra,
});

const route: WatchRoute = {
  id: 'route1',
  name: 'Lake loop',
  sport: 'run',
  points: [
    { lat: 47.37, lon: 8.54, ele: 410 },
    { lat: 47.372, lon: 8.542, ele: 420 },
    { lat: 47.374, lon: 8.544, ele: 415 },
  ],
};

/** A FIT activity file as a watch writes it. */
function activityFit(sport: string, subSport: string, withGps = true): Uint8Array {
  const encoder = new Encoder();
  // 23:15 UTC is already the next day for a user one hour ahead of UTC.
  const start = new Date('2026-11-02T23:15:00Z');
  const fileId: Record<string, unknown> = {
    type: 'activity',
    manufacturer: 'development',
    product: 0,
    timeCreated: start,
  };
  encoder.onMesg(Profile.MesgNum.FILE_ID as number, fileId);
  const session: Record<string, unknown> = {
    timestamp: new Date('2026-11-03T00:15:00Z'),
    startTime: start,
    sport,
    subSport,
    totalTimerTime: 3500,
    totalElapsedTime: 3600,
    totalDistance: 10_000,
    totalAscent: 120,
    avgHeartRate: 146,
    maxHeartRate: 171,
    ...(withGps ? { startPositionLat: 560_000_000, startPositionLong: 100_000_000 } : {}),
  };
  encoder.onMesg(Profile.MesgNum.SESSION as number, session);
  const activity: Record<string, unknown> = {
    timestamp: new Date('2026-11-03T00:15:00Z'),
    // A local date-time is a plain FIT number: seconds since 1989-12-31 in the user's local time.
    localTimestamp: (Date.parse('2026-11-03T01:15:00Z') / 1000) - 631_065_600,
    numSessions: 1,
  };
  encoder.onMesg(Profile.MesgNum.ACTIVITY as number, activity);
  return encoder.close();
}

// ---------------------------------------------------------------------------------------------

describe('feature flags', () => {
  it('are off unless the secret is 1 or true', () => {
    const env = (name: string) => ({ WATCH_COROS: '1', WATCH_SUUNTO: 'true', WATCH_GARMIN_TRAINING: '0' })[name];
    expect(flagEnabled(env, 'coros')).toBe(true);
    expect(flagEnabled(env, 'suunto')).toBe(true);
    expect(flagEnabled(env, 'garminTraining')).toBe(false);
    expect(flagEnabled(env, 'garminCourses')).toBe(false);
  });
});

describe('http client', () => {
  it('maps statuses to failures and never throws', async () => {
    const status = (s: number) =>
      requestJson(async () => new Response('x', { status: s }), 'https://x.test/');
    expect(await status(401)).toMatchObject({ ok: false, failure: 'not_connected' });
    expect(await status(429)).toMatchObject({ ok: false, failure: 'rate_limited' });
    expect(await status(404)).toMatchObject({ ok: false, failure: 'unsupported' });
    expect(await status(422)).toMatchObject({ ok: false, failure: 'rejected', detail: 'x' });
    const down = await requestJson(async () => Promise.reject(new Error('offline')), 'https://x.test/');
    expect(down).toMatchObject({ ok: false, failure: 'network' });
    const text = await requestJson(async () => new Response('plain'), 'https://x.test/');
    expect(text).toMatchObject({ ok: true, body: 'plain' });
    const empty = await requestJson(async () => new Response(''), 'https://x.test/');
    expect(empty).toMatchObject({ ok: true, body: null });
  });
});

describe('re-sync on change', () => {
  it('creates new, updates changed, keeps unchanged and removes what left the plan', () => {
    const a = run('a', '2026-11-02');
    const b = run('b', '2026-11-03');
    const c = run('c', '2026-11-04');
    const pushed: PushedRecord[] = [
      { workoutId: 'a', externalId: 'ext-a', hash: workoutHash(a) },
      { workoutId: 'b', externalId: 'ext-b', hash: 'old' },
      { workoutId: 'gone', externalId: 'ext-gone', hash: 'x' },
    ];
    const plan = planSync([a, b, c], pushed);
    expect(plan.unchanged.map((r) => r.workoutId)).toEqual(['a']);
    expect(plan.update.map((u) => u.previous.externalId)).toEqual(['ext-b']);
    expect(plan.create.map((w) => w.id)).toEqual(['c']);
    expect(plan.remove.map((r) => r.workoutId)).toEqual(['gone']);
  });

  it('moving a workout to another day changes its hash', () => {
    expect(workoutHash(run('a', '2026-11-02'))).not.toBe(workoutHash(run('a', '2026-11-03')));
  });

  it('windows to the next N days', () => {
    const ws = [run('a', '2026-11-01'), run('b', '2026-11-02'), run('c', '2026-11-08'), run('d', '2026-11-09')];
    expect(inWindow(ws, '2026-11-02', 7).map((w) => w.id)).toEqual(['b', 'c']);
  });
});

describe('Garmin Training API contract', () => {
  const ok = (body: unknown) => () => jsonResponse(body);

  it('builds the workout payload: steps, repeats, targets in m/s and bpm', () => {
    const payload = garminWorkoutPayload(run('a', '2026-11-02'));
    expect(payload).toMatchObject({ sport: 'RUNNING', workoutProvider: 'Peakr' });
    const steps = payload.steps as Record<string, unknown>[];
    expect(steps[0]).toMatchObject({
      type: 'WorkoutStep',
      stepOrder: 1,
      intensity: 'WARMUP',
      durationType: 'TIME',
      durationValue: 600,
      targetType: 'HEART_RATE',
      targetValueLow: 120,
      targetValueHigh: 140,
    });
    expect(steps[1]).toMatchObject({
      type: 'WorkoutRepeatStep',
      stepOrder: 2,
      repeatType: 'REPEAT_UNTIL_STEPS_CMPLT',
      repeatValue: 4,
    });
    const inner = (steps[1] as { steps: Record<string, unknown>[] }).steps;
    expect(inner[0]).toMatchObject({ stepOrder: 3, durationType: 'DISTANCE', durationValue: 400, targetType: 'SPEED' });
    expect(inner[0]?.targetValueLow).toBeCloseTo(4.0, 2);
    expect(inner[0]?.targetValueHigh).toBeCloseTo(4.167, 2);
    expect(inner[1]).toMatchObject({ intensity: 'RECOVERY', targetType: 'OPEN' });
  });

  it('adds the pool length for a pool swim', () => {
    const swim = garminWorkoutPayload({
      id: 's',
      date: '2026-11-02',
      name: 'Swim',
      sport: 'swim',
      poolLengthM: 50,
      steps: [],
    });
    expect(swim).toMatchObject({ sport: 'LAP_SWIMMING', poolLength: 50, poolLengthUnit: 'METER' });
  });

  it('creates a workout, puts it on the calendar and keeps both ids', async () => {
    const api = mockApi({
      'POST /training-api/workout': ok({ workoutId: 'g1' }),
      'POST /training-api/schedule': ok({ scheduleId: 's1' }),
    });
    const training = createGarminTrainingApi({ fetch: api.fetch, accessToken: 'tok' });
    const out = await syncGarminWorkouts(training, [run('a', '2026-11-02')], []);
    expect(out.stopped).toBeNull();
    expect(out.records).toEqual([
      { workoutId: 'a', externalId: 'g1', extra: 's1', hash: workoutHash(run('a', '2026-11-02')) },
    ]);
    expect(api.calls[0]?.headers.Authorization).toBe('Bearer tok');
    expect(api.calls[1]?.body).toEqual({ workoutId: 'g1', date: '2026-11-02' });
  });

  it('moves a changed workout: updates it and replaces the calendar entry', async () => {
    const api = mockApi({
      'PUT /training-api/workout/g1': ok({}),
      'DELETE /training-api/schedule/s1': () => new Response(null, { status: 204 }),
      'POST /training-api/schedule': ok({ scheduleId: 's2' }),
    });
    const training = createGarminTrainingApi({ fetch: api.fetch, accessToken: 'tok' });
    const moved = run('a', '2026-11-05');
    const out = await syncGarminWorkouts(training, [moved], [
      { workoutId: 'a', externalId: 'g1', extra: 's1', hash: 'old' },
    ]);
    expect(out.records[0]).toMatchObject({ externalId: 'g1', extra: 's2' });
    expect(api.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'PUT /training-api/workout/g1',
      'DELETE /training-api/schedule/s1',
      'POST /training-api/schedule',
    ]);
  });

  it('removes workouts that left the plan', async () => {
    const api = mockApi({
      'DELETE /training-api/schedule/s1': () => new Response(null, { status: 204 }),
      'DELETE /training-api/workout/g1': () => new Response(null, { status: 204 }),
    });
    const training = createGarminTrainingApi({ fetch: api.fetch, accessToken: 'tok' });
    const out = await syncGarminWorkouts(training, [], [
      { workoutId: 'a', externalId: 'g1', extra: 's1', hash: 'h' },
    ]);
    expect(out.records).toEqual([]);
    expect(api.calls).toHaveLength(2);
  });

  it('stops at once when the token is revoked and keeps the old records', async () => {
    const api = mockApi({ 'POST /training-api/workout': () => new Response('no', { status: 401 }) });
    const training = createGarminTrainingApi({ fetch: api.fetch, accessToken: 'tok' });
    const out = await syncGarminWorkouts(
      training,
      [run('a', '2026-11-02'), run('b', '2026-11-03')],
      [{ workoutId: 'z', externalId: 'gz', hash: 'h' }],
    );
    expect(out.stopped).toBe('not_connected');
    expect(api.calls).toHaveLength(1);
    expect(out.records).toEqual([{ workoutId: 'z', externalId: 'gz', hash: 'h' }]);
    expect(out.items[0]).toMatchObject({ id: 'a', ok: false, failure: 'not_connected' });
  });

  it('does not keep a workout it could not schedule', async () => {
    const api = mockApi({
      'POST /training-api/workout': ok({ workoutId: 'g1' }),
      'POST /training-api/schedule': () => new Response('bad date', { status: 400 }),
      'DELETE /training-api/workout/g1': () => new Response(null, { status: 204 }),
    });
    const training = createGarminTrainingApi({ fetch: api.fetch, accessToken: 'tok' });
    const out = await syncGarminWorkouts(training, [run('a', '2026-11-02')], []);
    expect(out.records).toEqual([]);
    expect(out.items[0]).toMatchObject({ ok: false, failure: 'rejected', detail: 'bad date' });
    expect(api.calls.at(-1)?.method).toBe('DELETE');
  });

  it('reports an answer without an id as rejected', async () => {
    const api = mockApi({ 'POST /training-api/workout': ok({}) });
    const training = createGarminTrainingApi({ fetch: api.fetch, accessToken: 'tok' });
    expect(await training.createWorkout(run('a', '2026-11-02'))).toMatchObject({
      ok: false,
      failure: 'rejected',
    });
  });
});

describe('Garmin Courses API contract', () => {
  it('computes distance and elevation from the route and publishes it', async () => {
    const payload = garminCoursePayload(route);
    expect(payload).toMatchObject({ courseName: 'Lake loop', activityType: 'RUNNING' });
    expect(payload.distance as number).toBeGreaterThan(400);
    expect(payload.elevationGain).toBe(10);
    expect(payload.elevationLoss).toBe(5);
    expect((payload.geoPoints as unknown[]).length).toBe(3);

    const api = mockApi({ 'POST /training-api/courses/v1/course': () => jsonResponse({ courseId: 77 }) });
    const courses = createGarminCoursesApi({ fetch: api.fetch, accessToken: 'tok' });
    expect(await publishGarminCourse(courses, route)).toEqual({
      ok: true,
      items: [{ id: 'route1', ok: true, externalId: '77' }],
    });
  });

  it('is a publishing API only: it has no way to read the user\'s courses', () => {
    const courses = createGarminCoursesApi({ fetch: async () => new Response('{}'), accessToken: 't' });
    expect(Object.keys(courses)).toEqual(['publishCourse']);
  });

  it('passes a refusal on', async () => {
    const api = mockApi({ 'POST /training-api/courses/v1/course': () => new Response('too long', { status: 413 }) });
    const courses = createGarminCoursesApi({ fetch: api.fetch, accessToken: 'tok' });
    expect(await publishGarminCourse(courses, route)).toMatchObject({ ok: false, failure: 'rejected' });
    const noId = mockApi({ 'POST /training-api/courses/v1/course': () => jsonResponse({}) });
    expect(
      await publishGarminCourse(createGarminCoursesApi({ fetch: noId.fetch, accessToken: 't' }), route),
    ).toMatchObject({ ok: false, failure: 'rejected' });
  });
});

describe('Garmin Activity API push', () => {
  const push = {
    activities: [
      {
        userId: 'g-user',
        summaryId: 'sum-1',
        activityId: 9001,
        activityType: 'TRAIL_RUNNING',
        activityName: 'Morning trail',
        startTimeInSeconds: 1_793_600_000,
        startTimeOffsetInSeconds: 3600,
        durationInSeconds: 3000,
        distanceInMeters: 8200,
        totalElevationGainInMeters: 310,
        averageHeartRateInBeatsPerMinute: 148,
        maxHeartRateInBeatsPerMinute: 172,
      },
      {
        userId: 'g-user',
        summaryId: 'sum-2',
        activityType: 'YOGA',
        startTimeInSeconds: 1_793_700_000,
        durationInSeconds: 1800,
      },
      { userId: 'g-user', activityType: 'RUNNING' },
    ],
    deregistrations: [{ userId: 'gone-user', userAccessToken: 'x' }],
  };

  it('maps a pushed activity to a row of the shared pipeline', () => {
    const parsed = parseGarminPush(push);
    expect(parsed.deregistered).toEqual(['gone-user']);
    expect(parsed.ignored).toBe(1);
    expect(parsed.activities).toHaveLength(1);
    const first = parsed.activities[0];
    if (!first) throw new Error('no activity parsed');
    expect(first.externalId).toBe('9001');
    const row = buildActivityRow('garmin', 'user-1', first.externalId, first.parts);
    expect(row).toMatchObject({
      source: 'garmin',
      sport: 'run',
      source_type: 'TRAIL_RUNNING',
      duration_sec: 3000,
      distance_m: 8200,
      elevation_gain_m: 310,
      avg_hr: 148,
      indoor: false,
      // 1_793_600_000 s is 2026-11-02T06:13:20Z; +1 h local offset.
      start_date_local: '2026-11-02',
      summary: false,
    });
  });

  it('survives garbage without throwing', () => {
    expect(parseGarminPush(null)).toEqual({ activities: [], deregistered: [], ignored: 0 });
    expect(parseGarminPush({ activities: 'x', deregistrations: [{}] }).activities).toEqual([]);
  });

  it('treats pool swims and trainer rides as indoor and swims get a pace', () => {
    const parsed = parseGarminPush({
      activities: [
        { userId: 'u', summaryId: 's', activityType: 'LAP_SWIMMING', startTimeInSeconds: 1_793_600_000, durationInSeconds: 2000, distanceInMeters: 1000 },
        { userId: 'u', summaryId: 't', activityType: 'INDOOR_CYCLING', startTimeInSeconds: 1_793_600_000, durationInSeconds: 3600, distanceInMeters: 30_000 },
      ],
    });
    const [swim, bike] = parsed.activities.map((a) => buildActivityRow('garmin', 'u', a.externalId, a.parts));
    expect(swim).toMatchObject({ sport: 'swim', indoor: true, swim_pace_sec_per_100m: 200 });
    expect(bike).toMatchObject({ sport: 'bike', indoor: true });
  });

  it('rejects an activity with no duration', () => {
    expect(
      buildActivityRow('garmin', 'u', 'x', {
        sport: 'run', sourceType: 'RUNNING', name: null, startMs: 0, offsetSec: 0, durationSec: 0,
        distanceM: null, elevationGainM: null, avgHr: null, maxHr: null, indoor: false,
      }),
    ).toBeNull();
  });
});

describe('COROS contract', () => {
  const idle = () => jsonResponse({ result: '0000' });

  it('maps a workout to a plan entity with day, sport and steps', () => {
    const entity = corosPlanEntity(run('a', '2026-11-02'));
    expect(entity).toMatchObject({ idInPlan: 'a', happenDay: '20261102', sportType: 1 });
    const exercises = entity.exercises as Record<string, unknown>[];
    expect(exercises[0]).toMatchObject({ exerciseType: 1, targetType: 'time', targetValue: 600, intensityType: 'heartRate' });
    expect(exercises[1]).toMatchObject({ repeat: 4 });
  });

  it('pushes only the next 7 days and re-syncs on change', async () => {
    const api = mockApi({ 'POST /v2/coros/plan/entity': idle, 'POST /v2/coros/plan/entity/delete': idle });
    const coros = createCorosApi({ fetch: api.fetch, accessToken: 'tok', openId: 'o1' });
    const week = [run('a', '2026-11-02'), run('b', '2026-11-08'), run('late', '2026-11-20')];
    const first = await syncCorosPlan(coros, week, '2026-11-02', []);
    expect(first.records.map((r) => r.workoutId)).toEqual(['a', 'b']);
    expect(api.calls).toHaveLength(2);
    expect(api.calls[0]?.url).toContain('token=tok&openId=o1');

    // Nothing changed: nothing is sent again.
    const again = await syncCorosPlan(coros, week, '2026-11-02', first.records);
    expect(api.calls).toHaveLength(2);
    expect(again.items.every((i) => i.ok)).toBe(true);

    // One workout moved, one dropped out of the plan.
    const changed = [run('a', '2026-11-03')];
    const third = await syncCorosPlan(coros, changed, '2026-11-02', first.records);
    expect(third.records.map((r) => r.workoutId)).toEqual(['a']);
    expect(api.calls.map((c) => new URL(c.url).pathname).slice(2)).toEqual([
      '/v2/coros/plan/entity',
      '/v2/coros/plan/entity/delete',
    ]);
  });

  it('renames and empties a workout when COROS cannot delete it', async () => {
    const api = mockApi({ 'POST /v2/coros/plan/entity': idle });
    const coros = createCorosApi({ fetch: api.fetch, accessToken: 'tok', openId: 'o1' });
    const a = run('a', '2026-11-02');
    const out = await syncCorosPlan(coros, [], '2026-11-02', [{ workoutId: 'a', externalId: 'a', hash: 'h' }], new Map([['a', a]]));
    expect(out.records).toEqual([]);
    const sent = api.calls.at(-1)?.body as Record<string, unknown>;
    expect(String(sent.name)).toContain('removed');
    expect(sent.exercises).toEqual([]);
  });

  it('imports activities through their FIT files', async () => {
    const fit = activityFit('running', 'generic');
    const api = mockApi({
      'GET /v2/coros/sport/list': () => jsonResponse({ data: [{ labelId: 'L1', fitUrl: 'https://files.coros.test/L1.fit' }, { labelId: 'L2' }, {}] }),
      'GET /L1.fit': () => new Response(fit as BodyInit),
    });
    const coros = createCorosApi({ fetch: api.fetch, accessToken: 'tok', openId: 'o1' });
    const result = await importCorosActivities(coros, 'user-1', new Date('2026-10-01'), new Date('2026-11-02'));
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ source: 'coros', external_id: 'L1', sport: 'run', distance_m: 10_000 });
    expect(api.calls[0]?.url).toContain('startDate=20261001&endDate=20261102');
  });

  it('reports a failed list and an unreachable FIT file', async () => {
    const down = mockApi({ 'GET /v2/coros/sport/list': () => new Response('x', { status: 429 }) });
    const c1 = createCorosApi({ fetch: down.fetch, accessToken: 't', openId: 'o' });
    expect(await importCorosActivities(c1, 'u', new Date())).toMatchObject({ ok: false, failure: 'rate_limited' });
    const gone = mockApi({
      'GET /v2/coros/sport/list': () => jsonResponse({ data: [{ labelId: 'L1', fitUrl: 'https://files.coros.test/L1.fit' }] }),
      'GET /L1.fit': () => new Response('x', { status: 404 }),
    });
    const c2 = createCorosApi({ fetch: gone.fetch, accessToken: 't', openId: 'o' });
    expect(await importCorosActivities(c2, 'u', new Date())).toMatchObject({ ok: true, rows: [] });
    const offline = createCorosApi({ fetch: async () => Promise.reject(new Error('x')), accessToken: 't', openId: 'o' });
    expect(await offline.downloadFit('https://x.test/f.fit')).toBeNull();
  });
});

describe('Suunto contract', () => {
  const key = 'sub-key';

  it('pushes a route as a GPX file with the subscription key', async () => {
    const api = mockApi({ 'POST /v2/route/import': () => jsonResponse({ id: 'sr1' }) });
    const suunto = createSuuntoApi({ fetch: api.fetch, accessToken: 'tok', subscriptionKey: key });
    const result = await suunto.pushRoute(route);
    expect(result).toEqual({ ok: true, items: [{ id: 'route1', ok: true, externalId: 'sr1' }] });
    const call = api.calls[0];
    if (!call) throw new Error('no request');
    expect(call.headers).toMatchObject({ Authorization: 'Bearer tok', 'Ocp-Apim-Subscription-Key': key });
    const gpx = atob((call.body as { gpx: string }).gpx);
    expect(gpx).toContain('<trkpt lat="47.370000"');
  });

  it('pushes workouts as FIT files', async () => {
    const api = mockApi({ 'POST /v2/workout/import': () => jsonResponse({ id: 'sw1' }) });
    const suunto = createSuuntoApi({ fetch: api.fetch, accessToken: 'tok', subscriptionKey: key });
    const result = await suunto.pushWorkouts([run('a', '2026-11-02')]);
    expect(result).toEqual({ ok: true, items: [{ id: 'a', ok: true, externalId: 'sw1' }] });
    const sent = api.calls[0]?.body as { fit: string };
    const fitBytes = Uint8Array.from(atob(sent.fit), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(fitBytes.slice(8, 12))).toBe('.FIT');
  });

  it('says so when Suunto does not take planned workouts, instead of pretending', async () => {
    const api = mockApi({});
    const suunto = createSuuntoApi({ fetch: api.fetch, accessToken: 'tok', subscriptionKey: key });
    expect(await suunto.pushWorkouts([run('a', '2026-11-02'), run('b', '2026-11-03')])).toMatchObject({
      ok: false,
      failure: 'unsupported',
    });
    expect(api.calls).toHaveLength(1);
  });

  it('continues after one refused workout', async () => {
    let n = 0;
    const api = mockApi({
      'POST /v2/workout/import': () => (n++ === 0 ? new Response('bad', { status: 422 }) : jsonResponse({ id: 'sw2' })),
    });
    const suunto = createSuuntoApi({ fetch: api.fetch, accessToken: 'tok', subscriptionKey: key });
    const result = await suunto.pushWorkouts([run('a', '2026-11-02'), run('b', '2026-11-03')]);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.items.map((i) => i.ok)).toEqual([false, true]);
  });

  it('reports a refused route', async () => {
    const api = mockApi({ 'POST /v2/route/import': () => new Response('x', { status: 401 }) });
    const suunto = createSuuntoApi({ fetch: api.fetch, accessToken: 'tok', subscriptionKey: key });
    expect(await suunto.pushRoute(route)).toMatchObject({ ok: false, failure: 'not_connected' });
  });

  it('reads the workout notification and imports the FIT file', async () => {
    expect(parseSuuntoNotification({ username: 'u1', workoutid: 123 })).toEqual({ username: 'u1', workoutId: '123' });
    expect(parseSuuntoNotification({ username: 'u1', workoutId: 'w' })).toEqual({ username: 'u1', workoutId: 'w' });
    expect(parseSuuntoNotification({ username: 'u1' })).toBeNull();
    expect(parseSuuntoNotification(null)).toBeNull();

    const fit = activityFit('cycling', 'road');
    const api = mockApi({ 'GET /v2/workout/123/fit': () => new Response(fit as BodyInit) });
    const suunto = createSuuntoApi({ fetch: api.fetch, accessToken: 'tok', subscriptionKey: key });
    const row = await importSuuntoWorkout(suunto, 'user-1', '123');
    expect(row).toMatchObject({ source: 'suunto', external_id: '123', sport: 'bike', avg_hr: 146, indoor: false });
    const missing = createSuuntoApi({ fetch: async () => new Response('x', { status: 404 }), accessToken: 't', subscriptionKey: key });
    expect(await importSuuntoWorkout(missing, 'user-1', '9')).toBeNull();
    const offline = createSuuntoApi({ fetch: async () => Promise.reject(new Error('x')), accessToken: 't', subscriptionKey: key });
    expect(await offline.downloadWorkoutFit('9')).toBeNull();
  });

  it('verifies the webhook signature (hex or base64) and refuses everything else', async () => {
    const body = '{"username":"u1","workoutid":1}';
    const secret = 's3cret';
    const keyObj = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', keyObj, new TextEncoder().encode(body)));
    const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
    const b64 = btoa(String.fromCharCode(...mac));
    expect(await verifySuuntoSignature(body, hex, secret)).toBe(true);
    expect(await verifySuuntoSignature(body, b64, secret)).toBe(true);
    expect(await verifySuuntoSignature(body, hex, 'other')).toBe(false);
    expect(await verifySuuntoSignature(body, null, secret)).toBe(false);
    expect(await verifySuuntoSignature(body, 'short', secret)).toBe(false);
  });
});

describe('activities from FIT files', () => {
  it('reads sport, time, distance, climb and heart rate and the local date', () => {
    const row = activityFromFit('suunto', 'u', 'w1', activityFit('running', 'trail'));
    expect(row).toMatchObject({
      sport: 'run',
      source_type: 'trail',
      duration_sec: 3500,
      elapsed_sec: 3600,
      distance_m: 10_000,
      elevation_gain_m: 120,
      avg_hr: 146,
      max_hr: 171,
      indoor: false,
      // Started 23:15 UTC = 00:15 local: the plan day is the next one.
      start_date_local: '2026-11-03',
    });
  });

  it('marks treadmill and pool sessions as indoor and files without GPS as indoor', () => {
    expect(activityFromFit('coros', 'u', 'a', activityFit('running', 'treadmill'))?.indoor).toBe(true);
    expect(activityFromFit('coros', 'u', 'b', activityFit('swimming', 'lapSwimming'))?.sport).toBe('swim');
    expect(activityFromFit('coros', 'u', 'c', activityFit('cycling', 'road', false))?.indoor).toBe(true);
  });

  it('ignores sports Peakr does not plan and bytes that are not FIT', () => {
    expect(activityFromFit('coros', 'u', 'a', activityFit('golf', 'generic'))).toBeNull();
    expect(activityFromFit('coros', 'u', 'a', new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('reads strength training as a summary session', () => {
    const row = activityFromFit('suunto', 'u', 'a', activityFit('training', 'strengthTraining'));
    expect(row).toMatchObject({ sport: 'strength', summary: true });
  });
});
