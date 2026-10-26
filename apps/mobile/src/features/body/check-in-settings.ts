/**
 * Body check-in rhythm (Body → Check-in → Rhythm): weigh daily, measure once a week on a chosen
 * day, and a reminder on that day. Kept on this device like the other reminder settings.
 */

export interface CheckInSettings {
  /** Weigh every day (the trend uses the day's value); off = weigh on the measuring day. */
  weighDaily: boolean;
  /** Measuring day, 0 = Sunday … 6 = Saturday. */
  measureWeekday: number;
  /** Remind on the measuring day (merged into the daily reminder when there is one). */
  reminder: boolean;
}

export const DEFAULT_CHECKIN_SETTINGS: CheckInSettings = {
  weighDaily: true,
  measureWeekday: 1,
  reminder: true,
};

export function parseCheckInSettings(raw: unknown): CheckInSettings {
  const d = DEFAULT_CHECKIN_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Partial<Record<keyof CheckInSettings, unknown>>;
  return {
    weighDaily: typeof r.weighDaily === 'boolean' ? r.weighDaily : d.weighDaily,
    measureWeekday:
      typeof r.measureWeekday === 'number' &&
      Number.isInteger(r.measureWeekday) &&
      r.measureWeekday >= 0 &&
      r.measureWeekday <= 6
        ? r.measureWeekday
        : d.measureWeekday,
    reminder: typeof r.reminder === 'boolean' ? r.reminder : d.reminder,
  };
}
