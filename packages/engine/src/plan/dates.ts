import type { Weekday } from './types';

/** Calendar maths on ISO dates (`YYYY-MM-DD`) in UTC – deterministic, no time zones. */

const DAY_MS = 86_400_000;

/** Day number since 1970-01-01, or null if the string is not a real calendar date. */
export function parseIsoDate(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return ms / DAY_MS;
}

export function toIsoDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(day: number): Weekday {
  // 1970-01-01 was a Thursday (weekday 3).
  return ((((day + 3) % 7) + 7) % 7) as Weekday;
}

/** Month 1–12. */
export function monthOf(day: number): number {
  return new Date(day * DAY_MS).getUTCMonth() + 1;
}
