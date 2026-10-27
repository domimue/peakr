import type { GarminHealthRecord, HealthMetric } from './model.ts';

/** Defensive JSON helpers: Garmin's payloads are read field by field, unknown fields ignored. */

export type Json = Record<string, unknown>;

export function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A finite number, or null (Garmin uses negative sentinels such as −1/−2 for "no data"). */
export function num(v: unknown, { allowNegative = false } = {}): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return !allowNegative && n < 0 ? null : n;
}

export function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isoDay(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const day = s.slice(0, 10);
  return DAY_RE.test(day) ? day : null;
}

/** Epoch milliseconds or seconds or an ISO string → ISO date-time (UTC), else null. */
export function isoTime(v: unknown): string | null {
  if (typeof v === 'string' && v.length >= 10) {
    // Garmin writes some timestamps as "2026-10-14 17:09:06" (space, no zone, UTC).
    const t = /^\d{4}-\d{2}-\d{2} \d/.test(v) ? `${v.slice(0, 10)}T${v.slice(11)}` : v;
    const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? t : `${t}Z`;
    const d = new Date(withZone);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const n = num(v);
  if (n === null || n === 0) return null;
  const ms = n < 1e11 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

/**
 * Wall-clock time "HH:MM" from a "local" timestamp. Garmin's `…Local` timestamps are the local
 * time written as if it were UTC, so reading them in UTC gives the time the user saw.
 */
export function wallClock(v: unknown): string | null {
  const iso = isoTime(v);
  return iso ? iso.slice(11, 16) : null;
}

/**
 * Every object in a response that has one of `dayKeys` (and passes `accept`) – whether the
 * endpoint returns a bare array, `{ items: [...] }` or a single DTO. Nested objects of a match are
 * not searched again; an object with a day that is not accepted (a wrapper) is searched further.
 */
export function collectEntries(
  body: unknown,
  dayKeys: readonly string[],
  accept: (entry: Json) => boolean = () => true,
): Json[] {
  const out: Json[] = [];
  const walk = (v: unknown, depth: number): void => {
    if (depth > 6) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    if (!isObject(v)) return;
    if (dayKeys.some((k) => isoDay(v[k]) !== null) && accept(v)) {
      out.push(v);
      return;
    }
    for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(body, 0);
  return out;
}

export function dayOf(entry: Json, dayKeys: readonly string[]): string | null {
  for (const k of dayKeys) {
    const d = isoDay(entry[k]);
    if (d) return d;
  }
  return null;
}

/** Collects records; `null` values are dropped so a missing field never becomes a zero. */
export class RecordSink {
  readonly records: GarminHealthRecord[] = [];

  add(
    metric: HealthMetric,
    day: string,
    value: number | null,
    sourceId: string,
    recordedAt: string,
    detail?: Record<string, unknown> | null,
  ): void {
    if (value === null) return;
    this.records.push({ metric, day, value, sourceId, recordedAt, ...(detail ? { detail } : {}) });
  }
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Garmin reports body mass in grams on some endpoints and kilograms on others. */
export function kg(v: unknown): number | null {
  const n = num(v);
  if (n === null || n === 0) return null;
  return round1(n > 1000 ? n / 1000 : n);
}

export function minutes(seconds: unknown): number | null {
  const n = num(seconds);
  return n === null ? null : Math.round(n / 60);
}
