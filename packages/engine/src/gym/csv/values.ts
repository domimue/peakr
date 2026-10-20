/** Parsing of the date, duration and number formats gym apps put into their CSV exports. */

/** Wall-clock date and time as written in the file (no time zone). */
export interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function valid(p: DateParts): DateParts | null {
  const days = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  if (p.month < 1 || p.month > 12 || p.day < 1 || p.day > days) return null;
  if (p.hour > 23 || p.minute > 59 || p.second > 59) return null;
  return p;
}

function time(rest: string | undefined): Pick<DateParts, 'hour' | 'minute' | 'second'> | null {
  const t = (rest ?? '').trim();
  if (t === '') return { hour: 0, minute: 0, second: 0 };
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(am|pm)?\s*(?:z|[+-]\d{2}:?\d{2})?$/i.exec(
    t,
  );
  if (!m) return null;
  let hour = Number(m[1]);
  const ampm = m[4]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  return { hour, minute: Number(m[2]), second: Number(m[3] ?? 0) };
}

/**
 * Reads the date formats seen in exports: ISO (`2024-01-18 07:39:00`, `2024-01-18T07:39:00Z`),
 * day-month-name (`18 Jan 2024, 07:39`), dotted European (`18.01.2024 07:39`) and slashed dates
 * (`01/18/2024 7:39 PM`; day-first when the first number is above 12 or `dayFirst` is set).
 * Time zones are ignored: the wall-clock time is what the user saw in the app.
 */
export function parseDateTime(text: string, dayFirst = false): DateParts | null {
  const s = text.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.*))?$/.exec(s);
  if (m) {
    const t = time(m[4]);
    return t ? valid({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), ...t }) : null;
  }
  m = /^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})(?: (.*))?$/i.exec(s);
  if (m) {
    const month = MONTHS.indexOf(String(m[2]).toLowerCase()) + 1;
    const t = time(m[4]);
    return t && month > 0 ? valid({ year: Number(m[3]), month, day: Number(m[1]), ...t }) : null;
  }
  m = /^([a-z]{3})[a-z]* (\d{1,2}) (\d{4})(?: (.*))?$/i.exec(s);
  if (m) {
    const month = MONTHS.indexOf(String(m[1]).toLowerCase()) + 1;
    const t = time(m[4]);
    return t && month > 0 ? valid({ year: Number(m[3]), month, day: Number(m[2]), ...t }) : null;
  }
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?: (.*))?$/.exec(s);
  if (m) {
    const t = time(m[4]);
    return t ? valid({ year: Number(m[3]), month: Number(m[2]), day: Number(m[1]), ...t }) : null;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (.*))?$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const df = dayFirst || a > 12;
    const t = time(m[4]);
    return t ? valid({ year: Number(m[3]), month: df ? b : a, day: df ? a : b, ...t }) : null;
  }
  return null;
}

export function dateKey(p: DateParts): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${two(p.month)}-${two(p.day)}`;
}

/** Seconds between two wall-clock times. */
export function secondsBetween(a: DateParts, b: DateParts): number {
  const ms = (p: DateParts) => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((ms(b) - ms(a)) / 1000);
}

/**
 * Durations as exports write them: `1h 5m`, `45m`, `1h`, `30s`, `1:05:00`, `65:00` or plain seconds.
 */
export function parseDuration(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (s === '') return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(s);
  if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const parts = [
    ...s.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?)\b/g),
  ];
  if (parts.length === 0) return null;
  let sec = 0;
  for (const p of parts) {
    const n = Number(p[1]);
    const unit = String(p[2]);
    sec += unit.startsWith('h') ? n * 3600 : unit.startsWith('m') ? n * 60 : n;
  }
  return Math.round(sec);
}

/** Numbers with `.` or `,` as decimal separator (`62,5`); empty or invalid → undefined. */
export function parseNumber(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const s = text.trim().replace(/\s/g, '');
  if (s === '') return undefined;
  const normalised = /^-?\d+,\d+$/.test(s) ? s.replace(',', '.') : s;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : undefined;
}
