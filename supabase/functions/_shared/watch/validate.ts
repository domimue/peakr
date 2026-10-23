import type {
  WatchIntensity,
  WatchNode,
  WatchRoute,
  WatchSport,
  WatchStep,
  WatchTarget,
  WatchWorkout,
} from './model.ts';

/**
 * Validation of what the app sends to the watch function. The function acts with the service role
 * and forwards the payload to third-party APIs, so nothing is trusted: shapes, ranges and sizes
 * are checked, everything unknown is dropped.
 */

export const MAX_WORKOUTS = 60;
export const MAX_STEPS = 60;
export const MAX_ROUTE_POINTS = 6000;

const SPORTS: readonly WatchSport[] = ['run', 'bike', 'swim'];
const INTENSITIES: readonly WatchIntensity[] = [
  'warmup',
  'active',
  'interval',
  'recovery',
  'rest',
  'cooldown',
];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;
const between = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

function target(value: unknown): WatchTarget | null {
  if (!isObject(value)) return null;
  switch (value.type) {
    case 'open':
      return { type: 'open' };
    case 'heartRate': {
      const low = between(value.lowBpm, 30, 250);
      const high = between(value.highBpm, 30, 250);
      return low !== null && high !== null && low <= high
        ? { type: 'heartRate', lowBpm: low, highBpm: high }
        : null;
    }
    case 'pace': {
      const fast = between(value.fastestSecPerKm, 90, 1800);
      const slow = between(value.slowestSecPerKm, 90, 1800);
      return fast !== null && slow !== null && fast <= slow
        ? { type: 'pace', fastestSecPerKm: fast, slowestSecPerKm: slow }
        : null;
    }
    case 'swimPace': {
      const fast = between(value.fastestSecPer100m, 40, 600);
      const slow = between(value.slowestSecPer100m, 40, 600);
      return fast !== null && slow !== null && fast <= slow
        ? { type: 'swimPace', fastestSecPer100m: fast, slowestSecPer100m: slow }
        : null;
    }
    default:
      return null;
  }
}

function step(value: unknown): WatchStep | null {
  if (!isObject(value) || value.kind !== 'step') return null;
  const intensity = INTENSITIES.find((i) => i === value.intensity);
  const t = target(value.target);
  if (!intensity || !t) return null;
  const out: WatchStep = { kind: 'step', intensity, target: t };
  if (value.durationSec !== undefined) {
    const d = between(value.durationSec, 1, 86_400);
    if (d === null) return null;
    out.durationSec = d;
  }
  if (value.distanceM !== undefined) {
    const d = between(value.distanceM, 1, 500_000);
    if (d === null) return null;
    out.distanceM = d;
  }
  if (value.name !== undefined) out.name = text(value.name, 64) ?? undefined;
  if (value.note !== undefined) out.note = text(value.note, 200) ?? undefined;
  return out;
}

export function workout(value: unknown): WatchWorkout | null {
  if (!isObject(value)) return null;
  const sport = SPORTS.find((s) => s === value.sport);
  const id = text(value.id, 128);
  const name = text(value.name, 120);
  const date =
    typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : null;
  if (!sport || !id || !name || !date || !Array.isArray(value.steps)) return null;
  const steps: WatchNode[] = [];
  let count = 0;
  for (const raw of value.steps) {
    if (isObject(raw) && raw.kind === 'repeat') {
      const repeat = between(raw.count, 1, 99);
      const inner = Array.isArray(raw.steps) ? raw.steps.map(step) : [];
      if (repeat === null || inner.length === 0 || inner.some((s) => s === null)) return null;
      count += inner.length + 1;
      steps.push({ kind: 'repeat', count: repeat, steps: inner as WatchStep[] });
    } else {
      const s = step(raw);
      if (!s) return null;
      count++;
      steps.push(s);
    }
    if (count > MAX_STEPS) return null;
  }
  const out: WatchWorkout = { id, date, name, sport, steps };
  if (value.poolLengthM === 25 || value.poolLengthM === 50) out.poolLengthM = value.poolLengthM;
  if (value.description !== undefined) out.description = text(value.description, 500) ?? undefined;
  return out;
}

export function workouts(value: unknown): WatchWorkout[] | null {
  if (!Array.isArray(value) || value.length > MAX_WORKOUTS) return null;
  const out = value.map(workout);
  return out.every((w) => w !== null) ? (out as WatchWorkout[]) : null;
}

export function route(value: unknown): WatchRoute | null {
  if (!isObject(value)) return null;
  const id = text(value.id, 128);
  const name = text(value.name, 120);
  const sport = value.sport === 'run' || value.sport === 'bike' ? value.sport : null;
  if (!id || !name || !sport || !Array.isArray(value.points)) return null;
  if (value.points.length < 2 || value.points.length > MAX_ROUTE_POINTS) return null;
  const points: WatchRoute['points'] = [];
  for (const p of value.points) {
    if (!isObject(p)) return null;
    const lat = between(p.lat, -90, 90);
    const lon = between(p.lon, -180, 180);
    const ele = p.ele === null || p.ele === undefined ? null : between(p.ele, -500, 9000);
    if (lat === null || lon === null || (p.ele !== null && p.ele !== undefined && ele === null)) {
      return null;
    }
    points.push({ lat, lon, ele });
  }
  return { id, name, sport, points };
}
