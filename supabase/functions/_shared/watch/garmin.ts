import type { ActivityParts } from './activity-map.ts';
import { GARMIN } from './contracts.ts';
import { requestJson, type Fetch } from './http.ts';
import type { PushResult, WatchNode, WatchRoute, WatchStep, WatchWorkout } from './model.ts';
import { speedFromPace, speedFromSwimPace } from './model.ts';
import { applySync, type OpResult, type PushedRecord, type SyncOutcome } from './sync.ts';

/**
 * Garmin Connect Developer Program: Training API (structured workouts), Courses API (routes) and
 * Activity API (completed activities). All three are behind feature flags until the program has
 * approved Peakr's app (see docs/watch-integrations.md).
 *
 * VERIFICATION STATUS – read before switching a flag on: Garmin publishes the exact Training and
 * Courses schemas only to approved developers (portal login). The programme itself is confirmed:
 * Starter access carries Activity, Courses, Health, Training and Women's Health as JSON with push
 * delivery only (developer.garmin.com/gc-developer-program/overview). The endpoint paths and the
 * field names below are written from Garmin's public descriptions and are kept in `GARMIN` and in
 * the two payload builders, so confirming them against the portal documentation means editing
 * those three places and the contract tests, nothing else.
 */

export { GARMIN };

// ---------------------------------------------------------------------------------------------
// Training API

const SPORT = { run: 'RUNNING', bike: 'CYCLING', swim: 'LAP_SWIMMING' } as const;

function stepPayload(step: WatchStep, order: number): Record<string, unknown> {
  const t = step.target;
  const duration =
    step.durationSec && step.durationSec > 0
      ? { durationType: 'TIME', durationValue: Math.round(step.durationSec) }
      : step.distanceM && step.distanceM > 0
        ? { durationType: 'DISTANCE', durationValue: Math.round(step.distanceM) }
        : { durationType: 'OPEN', durationValue: null };
  let target: Record<string, unknown>;
  switch (t.type) {
    case 'heartRate':
      target = {
        targetType: 'HEART_RATE',
        targetValueLow: Math.round(t.lowBpm),
        targetValueHigh: Math.round(t.highBpm),
      };
      break;
    case 'pace':
      target = {
        targetType: 'SPEED',
        // m/s, low = slow end.
        targetValueLow: round3(speedFromPace(t.slowestSecPerKm)),
        targetValueHigh: round3(speedFromPace(t.fastestSecPerKm)),
      };
      break;
    case 'swimPace':
      target = {
        targetType: 'SPEED',
        targetValueLow: round3(speedFromSwimPace(t.slowestSecPer100m)),
        targetValueHigh: round3(speedFromSwimPace(t.fastestSecPer100m)),
      };
      break;
    default:
      target = { targetType: 'OPEN', targetValueLow: null, targetValueHigh: null };
  }
  return {
    type: 'WorkoutStep',
    stepOrder: order,
    intensity: step.intensity.toUpperCase(),
    description: step.note ?? step.name ?? null,
    ...duration,
    ...target,
  };
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Garmin numbers every step (repeat steps and their children share one running order). */
function stepsPayload(nodes: readonly WatchNode[]): Record<string, unknown>[] {
  let order = 0;
  return nodes.map((node) => {
    if (node.kind === 'step') return stepPayload(node, ++order);
    const repeatOrder = ++order;
    return {
      type: 'WorkoutRepeatStep',
      stepOrder: repeatOrder,
      repeatType: 'REPEAT_UNTIL_STEPS_CMPLT',
      repeatValue: node.count,
      steps: node.steps.map((s) => stepPayload(s, ++order)),
    };
  });
}

/** Body of `POST {trainingBase}/workout`. */
export function garminWorkoutPayload(w: WatchWorkout): Record<string, unknown> {
  return {
    workoutName: w.name.slice(0, 80),
    description: w.description ?? null,
    sport: SPORT[w.sport],
    workoutProvider: 'Peakr',
    workoutSourceId: 'Peakr',
    ...(w.sport === 'swim' && w.poolLengthM
      ? { poolLength: w.poolLengthM, poolLengthUnit: 'METER' }
      : {}),
    steps: stepsPayload(w.steps),
  };
}

export type ApiResult<T> =
  { ok: true; value: T } | { ok: false; failure: OpResultFailure; detail?: string };
type OpResultFailure = Extract<OpResult, { ok: false }>['failure'];

export interface GarminTrainingApi {
  createWorkout(w: WatchWorkout): Promise<ApiResult<{ workoutId: string }>>;
  updateWorkout(workoutId: string, w: WatchWorkout): Promise<ApiResult<{ workoutId: string }>>;
  deleteWorkout(workoutId: string): Promise<ApiResult<null>>;
  /** Puts the workout on the calendar of the watch for that day. */
  schedule(workoutId: string, date: string): Promise<ApiResult<{ scheduleId: string }>>;
  unschedule(scheduleId: string): Promise<ApiResult<null>>;
}

export interface GarminClientOptions {
  fetch: Fetch;
  accessToken: string;
  /** Overridable for tests and for Garmin's production/evaluation environments. */
  base?: string;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function createGarminTrainingApi(o: GarminClientOptions): GarminTrainingApi {
  const base = o.base ?? GARMIN.trainingBase;
  const call = async <T>(path: string, init: RequestInit & { json?: unknown }) => {
    const r = await requestJson<T>(o.fetch, `${base}${path}`, {
      ...init,
      headers: auth(o.accessToken),
    });
    return r.ok ? ({ ok: true, value: r.body } as const) : r;
  };
  const idOf = (body: unknown, key: string): string | null => {
    const v = (body as Record<string, unknown> | null)?.[key];
    return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
  };
  return {
    async createWorkout(w) {
      const r = await call<unknown>('/workout', { method: 'POST', json: garminWorkoutPayload(w) });
      if (!r.ok) return r;
      const id = idOf(r.value, 'workoutId');
      return id ? { ok: true, value: { workoutId: id } } : bad('no workoutId in the response');
    },
    async updateWorkout(workoutId, w) {
      const r = await call<unknown>(`/workout/${encodeURIComponent(workoutId)}`, {
        method: 'PUT',
        json: garminWorkoutPayload(w),
      });
      return r.ok ? { ok: true, value: { workoutId } } : r;
    },
    async deleteWorkout(workoutId) {
      const r = await call<unknown>(`/workout/${encodeURIComponent(workoutId)}`, {
        method: 'DELETE',
      });
      return r.ok ? { ok: true, value: null } : r;
    },
    async schedule(workoutId, date) {
      const r = await call<unknown>('/schedule', { method: 'POST', json: { workoutId, date } });
      if (!r.ok) return r;
      const id = idOf(r.value, 'scheduleId');
      return id ? { ok: true, value: { scheduleId: id } } : bad('no scheduleId in the response');
    },
    async unschedule(scheduleId) {
      const r = await call<unknown>(`/schedule/${encodeURIComponent(scheduleId)}`, {
        method: 'DELETE',
      });
      return r.ok ? { ok: true, value: null } : r;
    },
  };
}

const bad = (detail: string): { ok: false; failure: 'rejected'; detail: string } => ({
  ok: false,
  failure: 'rejected',
  detail,
});

/** Workout + calendar entry, as one operation set for the shared sync runner. */
export function garminWorkoutOps(api: GarminTrainingApi) {
  return {
    async create(w: WatchWorkout): Promise<OpResult> {
      const created = await api.createWorkout(w);
      if (!created.ok) return created;
      const scheduled = await api.schedule(created.value.workoutId, w.date);
      // Created but not scheduled: keep the workout id, the next sync schedules it again.
      if (!scheduled.ok) {
        await api.deleteWorkout(created.value.workoutId);
        return scheduled;
      }
      return { ok: true, externalId: created.value.workoutId, extra: scheduled.value.scheduleId };
    },
    async update(w: WatchWorkout, previous: PushedRecord): Promise<OpResult> {
      const updated = await api.updateWorkout(previous.externalId, w);
      if (!updated.ok) return updated;
      // The date may have changed: replace the calendar entry.
      if (previous.extra) await api.unschedule(previous.extra);
      const scheduled = await api.schedule(previous.externalId, w.date);
      if (!scheduled.ok) return scheduled;
      return { ok: true, externalId: previous.externalId, extra: scheduled.value.scheduleId };
    },
    async remove(previous: PushedRecord): Promise<OpResult> {
      if (previous.extra) await api.unschedule(previous.extra);
      const r = await api.deleteWorkout(previous.externalId);
      return r.ok ? { ok: true, externalId: previous.externalId } : r;
    },
  };
}

export function syncGarminWorkouts(
  api: GarminTrainingApi,
  desired: readonly WatchWorkout[],
  pushed: readonly PushedRecord[],
): Promise<SyncOutcome> {
  return applySync(desired, pushed, garminWorkoutOps(api));
}

// ---------------------------------------------------------------------------------------------
// Courses API (publishes routes TO Garmin Connect; it cannot read the user's existing courses,
// so it is not an import path – Komoot routes come in as GPX files)

export interface GarminCoursesApi {
  publishCourse(route: WatchRoute): Promise<ApiResult<{ courseId: string }>>;
}

const toRad = (d: number) => (d * Math.PI) / 180;

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const h =
    Math.sin(toRad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Body of `POST {coursesBase}/course`. */
export function garminCoursePayload(route: WatchRoute): Record<string, unknown> {
  let distance = 0;
  let gain = 0;
  let loss = 0;
  route.points.forEach((p, i) => {
    const prev = route.points[i - 1];
    if (!prev) return;
    distance += haversineM(prev, p);
    if (prev.ele !== null && p.ele !== null) {
      const d = p.ele - prev.ele;
      if (d > 0) gain += d;
      else loss -= d;
    }
  });
  return {
    courseName: route.name.slice(0, 80),
    activityType: route.sport === 'run' ? 'RUNNING' : 'CYCLING',
    distance: Math.round(distance),
    elevationGain: Math.round(gain),
    elevationLoss: Math.round(loss),
    geoPoints: route.points.map((p) => ({
      latitude: p.lat,
      longitude: p.lon,
      ...(p.ele !== null ? { elevation: Math.round(p.ele * 10) / 10 } : {}),
    })),
  };
}

export function createGarminCoursesApi(o: GarminClientOptions): GarminCoursesApi {
  const base = o.base ?? GARMIN.coursesBase;
  return {
    async publishCourse(route) {
      const r = await requestJson<unknown>(o.fetch, `${base}/course`, {
        method: 'POST',
        json: garminCoursePayload(route),
        headers: auth(o.accessToken),
      });
      if (!r.ok) return r;
      const id = (r.body as Record<string, unknown> | null)?.courseId;
      return typeof id === 'string' || typeof id === 'number'
        ? { ok: true, value: { courseId: String(id) } }
        : bad('no courseId in the response');
    },
  };
}

export async function publishGarminCourse(
  api: GarminCoursesApi,
  route: WatchRoute,
): Promise<PushResult> {
  const r = await api.publishCourse(route);
  if (!r.ok) return { ok: false, failure: r.failure, detail: r.detail };
  return { ok: true, items: [{ id: route.id, ok: true, externalId: r.value.courseId }] };
}

// ---------------------------------------------------------------------------------------------
// Activity API: push notifications (Starter access is push only)

/** One activity of a push notification, before it is tied to a Peakr user. */
export interface GarminPushedActivity {
  garminUserId: string;
  externalId: string;
  parts: ActivityParts;
}

export interface GarminPush {
  activities: GarminPushedActivity[];
  /** Garmin user ids that revoked Peakr's access: their Garmin data must be removed. */
  deregistered: string[];
  /** Activities the notification mentioned that Peakr does not plan (yoga, golf …). */
  ignored: number;
}

const GARMIN_SPORTS: Record<string, { sport: ActivityParts['sport']; indoor?: boolean }> = {
  RUNNING: { sport: 'run' },
  TRAIL_RUNNING: { sport: 'run' },
  TRACK_RUNNING: { sport: 'run' },
  TREADMILL_RUNNING: { sport: 'run', indoor: true },
  INDOOR_RUNNING: { sport: 'run', indoor: true },
  VIRTUAL_RUN: { sport: 'run', indoor: true },
  CYCLING: { sport: 'bike' },
  ROAD_BIKING: { sport: 'bike' },
  MOUNTAIN_BIKING: { sport: 'bike' },
  GRAVEL_CYCLING: { sport: 'bike' },
  INDOOR_CYCLING: { sport: 'bike', indoor: true },
  VIRTUAL_RIDE: { sport: 'bike', indoor: true },
  LAP_SWIMMING: { sport: 'swim', indoor: true },
  OPEN_WATER_SWIMMING: { sport: 'swim' },
  WALKING: { sport: 'walk' },
  HIKING: { sport: 'walk' },
  CROSS_COUNTRY_SKIING_WS: { sport: 'xcski' },
  CROSS_COUNTRY_SKIING: { sport: 'xcski' },
  BACKCOUNTRY_SKIING_SNOWBOARDING_WS: { sport: 'skitour' },
  BACKCOUNTRY_SKIING: { sport: 'skitour' },
  SNOWSHOE: { sport: 'snowshoe' },
  SNOW_SHOE: { sport: 'snowshoe' },
  STRENGTH_TRAINING: { sport: 'strength', indoor: true },
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : null;

/**
 * Reads the JSON Garmin POSTs to the Activity API callback URL: `activities` (summaries) and
 * `deregistrations`. Unknown shapes are skipped, never thrown on – Garmin retries a failing
 * callback, so the endpoint must always be able to answer 200.
 */
export function parseGarminPush(body: unknown): GarminPush {
  const out: GarminPush = { activities: [], deregistered: [], ignored: 0 };
  const root = (body ?? {}) as Record<string, unknown>;
  for (const d of Array.isArray(root.deregistrations) ? root.deregistrations : []) {
    const id = str((d as Record<string, unknown>).userId);
    if (id) out.deregistered.push(id);
  }
  for (const raw of Array.isArray(root.activities) ? root.activities : []) {
    const a = raw as Record<string, unknown>;
    const garminUserId = str(a.userId);
    const externalId = str(a.activityId) ?? str(a.summaryId);
    const kind = GARMIN_SPORTS[String(a.activityType ?? '')];
    const start = num(a.startTimeInSeconds);
    if (!garminUserId || !externalId || start === null) continue;
    if (!kind) {
      out.ignored++;
      continue;
    }
    const distance = num(a.distanceInMeters);
    out.activities.push({
      garminUserId,
      externalId,
      parts: {
        sport: kind.sport,
        sourceType: String(a.activityType),
        name: str(a.activityName),
        startMs: start * 1000,
        offsetSec: num(a.startTimeOffsetInSeconds) ?? 0,
        durationSec: num(a.durationInSeconds) ?? 0,
        distanceM: distance,
        elevationGainM: num(a.totalElevationGainInMeters),
        avgHr: num(a.averageHeartRateInBeatsPerMinute),
        maxHr: num(a.maxHeartRateInBeatsPerMinute),
        indoor: kind.indoor === true || !distance,
      },
    });
  }
  return out;
}
