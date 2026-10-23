import type { PushItem, WatchFailure, WatchWorkout } from './model.ts';

/**
 * Re-sync on change: what Peakr pushed earlier (per planned workout) against what the plan says
 * now. Unchanged workouts are not sent again, changed ones are updated in place, and workouts that
 * left the window or the plan are removed – so moving a workout in Peakr moves it on the watch.
 */

export interface PushedRecord {
  /** `WatchWorkout.id` */
  workoutId: string;
  /** Id at the platform. */
  externalId: string;
  /** A second platform id when needed (Garmin: the schedule entry of the workout). */
  extra?: string;
  /** Hash of the payload that was sent (see `workoutHash`). */
  hash: string;
}

export interface SyncPlan {
  create: WatchWorkout[];
  update: { workout: WatchWorkout; previous: PushedRecord }[];
  remove: PushedRecord[];
  unchanged: PushedRecord[];
}

/** FNV-1a over the JSON of the workout – enough to notice any change, not a security hash. */
export function workoutHash(workout: WatchWorkout): string {
  const text = JSON.stringify(workout);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** The workouts of the next `days` days from `today` (inclusive). COROS takes the next 7 days. */
export function inWindow(
  workouts: readonly WatchWorkout[],
  today: string,
  days: number,
): WatchWorkout[] {
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = start + days * 86_400_000;
  return workouts.filter((w) => {
    const t = Date.parse(`${w.date}T00:00:00Z`);
    return t >= start && t < end;
  });
}

export function planSync(
  desired: readonly WatchWorkout[],
  pushed: readonly PushedRecord[],
): SyncPlan {
  const byId = new Map(pushed.map((p) => [p.workoutId, p]));
  const plan: SyncPlan = { create: [], update: [], remove: [], unchanged: [] };
  for (const workout of desired) {
    const previous = byId.get(workout.id);
    if (!previous) plan.create.push(workout);
    else if (previous.hash !== workoutHash(workout)) plan.update.push({ workout, previous });
    else plan.unchanged.push(previous);
    byId.delete(workout.id);
  }
  plan.remove = [...byId.values()];
  return plan;
}

export type OpResult =
  | { ok: true; externalId: string; extra?: string }
  | { ok: false; failure: WatchFailure; detail?: string };

/** What a platform client can do with one workout. */
export interface WorkoutOps {
  create(workout: WatchWorkout): Promise<OpResult>;
  update(workout: WatchWorkout, previous: PushedRecord): Promise<OpResult>;
  remove(previous: PushedRecord): Promise<OpResult>;
}

export interface SyncOutcome {
  items: PushItem[];
  /** The records to store after this run (failed items keep their old record, if any). */
  records: PushedRecord[];
  /** A failure that makes continuing pointless (revoked token, rate limit): the run stopped. */
  stopped: WatchFailure | null;
}

const STOPPING: readonly WatchFailure[] = ['not_connected', 'rate_limited'];

/** Applies a sync plan with the platform's operations; one failed workout does not stop the rest. */
export async function applySync(
  desired: readonly WatchWorkout[],
  pushed: readonly PushedRecord[],
  ops: WorkoutOps,
): Promise<SyncOutcome> {
  const plan = planSync(desired, pushed);
  const items: PushItem[] = plan.unchanged.map((r) => ({
    id: r.workoutId,
    ok: true,
    externalId: r.externalId,
  }));
  const records: PushedRecord[] = [...plan.unchanged];
  let stopped: WatchFailure | null = null;

  const run = async (
    workout: WatchWorkout,
    previous: PushedRecord | null,
    op: Promise<OpResult>,
  ) => {
    const result = await op;
    if (result.ok) {
      items.push({ id: workout.id, ok: true, externalId: result.externalId });
      records.push({
        workoutId: workout.id,
        externalId: result.externalId,
        ...(result.extra ? { extra: result.extra } : {}),
        hash: workoutHash(workout),
      });
      return;
    }
    items.push({ id: workout.id, ok: false, failure: result.failure, detail: result.detail });
    if (previous) records.push(previous);
    if (STOPPING.includes(result.failure)) stopped = result.failure;
  };

  for (const workout of plan.create) {
    if (stopped) break;
    await run(workout, null, ops.create(workout));
  }
  for (const { workout, previous } of plan.update) {
    if (stopped) break;
    await run(workout, previous, ops.update(workout, previous));
  }
  for (const previous of plan.remove) {
    if (stopped) {
      records.push(previous);
      continue;
    }
    const result = await ops.remove(previous);
    // A workout that is already gone at the platform (404) counts as removed.
    if (result.ok || result.failure === 'unsupported') continue;
    records.push(previous);
    items.push({
      id: previous.workoutId,
      ok: false,
      failure: result.failure,
      detail: result.detail,
    });
    if (STOPPING.includes(result.failure)) stopped = result.failure;
  }
  return { items, records, stopped };
}
