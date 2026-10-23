import { activityFromFit } from './activity-map.ts';
import { requestJson, type Fetch } from './http.ts';
import type { ImportResult, WatchActivityRow, WatchNode, WatchStep, WatchWorkout } from './model.ts';
import { speedFromPace, speedFromSwimPace } from './model.ts';
import { applySync, inWindow, type OpResult, type PushedRecord, type SyncOutcome } from './sync.ts';

/**
 * COROS partner API: push the next 7 days of structured run, bike and swim workouts as a training
 * plan (visible in the COROS app / Training Hub and on the watch), re-sync on change, and import
 * completed activities into the shared pipeline. Behind `WATCH_COROS` until COROS has approved
 * Peakr as a partner (apply at api@coros.com, see docs/watch-integrations.md).
 *
 * VERIFICATION STATUS: COROS hands the API reference to approved partners only. The endpoint
 * paths and field names below are our best description of the documented concepts (OAuth 2.0,
 * a plan with entities per day, steps with a target, activity records with a FIT download
 * link) and live in `COROS` and `corosPlanEntity` so they can be corrected in one place once the
 * reference is in hand. Strength sessions are not supported by COROS: they are never pushed.
 */

export const COROS = {
  verified: false,
  authorizeUrl: 'https://open.coros.com/oauth2/authorize',
  tokenUrl: 'https://open.coros.com/oauth2/accesstoken',
  refreshUrl: 'https://open.coros.com/oauth2/refresh-token',
  apiBase: 'https://open.coros.com',
  /** COROS shows the next 7 days of a plan. */
  windowDays: 7,
} as const;

const SPORT_TYPE = { run: 1, bike: 2, swim: 3 } as const;
const STEP_KIND = { warmup: 1, training: 2, cooldown: 3, rest: 4 } as const;

function exercise(step: WatchStep): Record<string, unknown> {
  const kind =
    step.intensity === 'warmup'
      ? STEP_KIND.warmup
      : step.intensity === 'cooldown'
        ? STEP_KIND.cooldown
        : step.intensity === 'rest' || step.intensity === 'recovery'
          ? STEP_KIND.rest
          : STEP_KIND.training;
  const t = step.target;
  return {
    name: step.name ?? null,
    exerciseType: kind,
    ...(step.durationSec
      ? { targetType: 'time', targetValue: Math.round(step.durationSec) }
      : step.distanceM
        ? { targetType: 'distance', targetValue: Math.round(step.distanceM) }
        : { targetType: 'open', targetValue: 0 }),
    ...(t.type === 'heartRate'
      ? { intensityType: 'heartRate', intensityLow: Math.round(t.lowBpm), intensityHigh: Math.round(t.highBpm) }
      : t.type === 'pace'
        ? {
            intensityType: 'speed',
            intensityLow: round3(speedFromPace(t.slowestSecPerKm)),
            intensityHigh: round3(speedFromPace(t.fastestSecPerKm)),
          }
        : t.type === 'swimPace'
          ? {
              intensityType: 'speed',
              intensityLow: round3(speedFromSwimPace(t.slowestSecPer100m)),
              intensityHigh: round3(speedFromSwimPace(t.fastestSecPer100m)),
            }
          : { intensityType: 'open' }),
  };
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function exercises(nodes: readonly WatchNode[]): Record<string, unknown>[] {
  return nodes.map((n) =>
    n.kind === 'step'
      ? exercise(n)
      : { exerciseType: STEP_KIND.training, repeat: n.count, exercises: n.steps.map(exercise) },
  );
}

/** One day of the plan: `happenDay` is `YYYYMMDD`. */
export function corosPlanEntity(w: WatchWorkout, removed = false): Record<string, unknown> {
  return {
    idInPlan: w.id,
    happenDay: w.date.replaceAll('-', ''),
    sportType: SPORT_TYPE[w.sport],
    name: removed ? `Peakr · removed (${w.name})`.slice(0, 40) : w.name.slice(0, 40),
    ...(w.sport === 'swim' && w.poolLengthM ? { poolLength: w.poolLengthM } : {}),
    exercises: removed ? [] : exercises(w.steps),
  };
}

export interface CorosClientOptions {
  fetch: Fetch;
  accessToken: string;
  /** The user's id at COROS (`openId`). */
  openId: string;
  base?: string;
}

export interface CorosApi {
  /** Create or replace one entity of the Peakr plan (same `idInPlan` = same entry). */
  upsertEntity(w: WatchWorkout, removed?: boolean): Promise<OpResult>;
  deleteEntity(idInPlan: string): Promise<OpResult>;
  listActivities(since: Date, until: Date): Promise<ImportListResult>;
  downloadFit(url: string): Promise<Uint8Array | null>;
}

export type ImportListResult =
  | { ok: true; items: { labelId: string; fitUrl: string | null }[] }
  | { ok: false; failure: Extract<ImportResult, { ok: false }>['failure']; detail?: string };

const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');

export function createCorosApi(o: CorosClientOptions): CorosApi {
  const base = o.base ?? COROS.apiBase;
  const query = `token=${encodeURIComponent(o.accessToken)}&openId=${encodeURIComponent(o.openId)}`;
  return {
    async upsertEntity(w, removed = false) {
      const r = await requestJson(o.fetch, `${base}/v2/coros/plan/entity?${query}`, {
        method: 'POST',
        json: corosPlanEntity(w, removed),
      });
      return r.ok ? { ok: true, externalId: w.id } : r;
    },
    async deleteEntity(idInPlan) {
      const r = await requestJson(
        o.fetch,
        `${base}/v2/coros/plan/entity/delete?${query}&idInPlan=${encodeURIComponent(idInPlan)}`,
        { method: 'POST' },
      );
      return r.ok ? { ok: true, externalId: idInPlan } : r;
    },
    async listActivities(since, until) {
      const r = await requestJson<{ data?: Record<string, unknown>[] }>(
        o.fetch,
        `${base}/v2/coros/sport/list?${query}&startDate=${yyyymmdd(since)}&endDate=${yyyymmdd(until)}`,
      );
      if (!r.ok) return r;
      const items = (r.body?.data ?? []).flatMap((a) =>
        a.labelId !== undefined && a.labelId !== null
          ? [{ labelId: String(a.labelId), fitUrl: typeof a.fitUrl === 'string' ? a.fitUrl : null }]
          : [],
      );
      return { ok: true, items };
    },
    async downloadFit(url) {
      try {
        const response = await o.fetch(url);
        return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Pushes the next 7 days and keeps them in step with the plan. A workout that left the window is
 * deleted at COROS; where deleting is not supported it is renamed ("Peakr · removed") and emptied,
 * because a pushed workout may not disappear from the COROS app otherwise.
 */
export function syncCorosPlan(
  api: CorosApi,
  workouts: readonly WatchWorkout[],
  today: string,
  pushed: readonly PushedRecord[],
  previous: ReadonlyMap<string, WatchWorkout> = new Map(),
): Promise<SyncOutcome> {
  const desired = inWindow(workouts, today, COROS.windowDays);
  return applySync(desired, pushed, {
    create: (w) => api.upsertEntity(w),
    update: (w) => api.upsertEntity(w),
    async remove(record) {
      const deleted = await api.deleteEntity(record.workoutId);
      if (deleted.ok || deleted.failure !== 'unsupported') return deleted;
      const old = previous.get(record.workoutId);
      return api.upsertEntity(
        old ?? { id: record.workoutId, date: today, name: 'Peakr', sport: 'run', steps: [] },
        true,
      );
    },
  });
}

/** Completed activities since a date, through the activity list and the FIT file of each. */
export async function importCorosActivities(
  api: CorosApi,
  userId: string,
  since: Date,
  until: Date = new Date(),
  activityFromFile: typeof activityFromFit = activityFromFit,
): Promise<ImportResult> {
  const list = await api.listActivities(since, until);
  if (!list.ok) return list;
  const rows: WatchActivityRow[] = [];
  for (const item of list.items) {
    if (!item.fitUrl) continue;
    const bytes = await api.downloadFit(item.fitUrl);
    const row = bytes ? activityFromFile('coros', userId, item.labelId, bytes) : null;
    if (row) rows.push(row);
  }
  return { ok: true, rows, deleted: [] };
}
