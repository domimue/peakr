/**
 * Daily workout reminder settings (Settings → Notifications; CLAUDE.md "Account & notifications"):
 * on by default at 07:00 local time, changeable or off; the weather line is merged into the same
 * push. Stored on the device and mirrored to `notification_settings` with the device time zone.
 */

export interface ReminderSettings {
  enabled: boolean;
  /** Local time of day in minutes after midnight (420 = 07:00). */
  minute: number;
  /** Add the weather hint (rain, snow, ice, storm) to the reminder. */
  weather: boolean;
  /**
   * Congratulation after a synced activity was linked to a planned session – its own category,
   * at most one per session, never in place of the daily reminder.
   */
  congrats: boolean;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  minute: 7 * 60,
  weather: true,
  congrats: true,
};

/** The reminder time can be set in these steps. */
export const REMINDER_STEP_MIN = 15;

export function parseReminderSettings(raw: unknown): ReminderSettings {
  const d = DEFAULT_REMINDER_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Partial<Record<keyof ReminderSettings, unknown>>;
  const minute =
    typeof r.minute === 'number' && Number.isInteger(r.minute) && r.minute >= 0 && r.minute < 1440
      ? r.minute
      : d.minute;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    minute,
    weather: typeof r.weather === 'boolean' ? r.weather : d.weather,
    congrats: typeof r.congrats === 'boolean' ? r.congrats : d.congrats,
  };
}

/** The reminder time in the user's clock format ("7:00 AM", "07:00"). */
export function clockText(minute: number, language: string): string {
  const date = new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60);
  return date.toLocaleTimeString(language, { hour: 'numeric', minute: '2-digit' });
}
