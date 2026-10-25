/**
 * Daily workout reminder (CLAUDE.md "Account & notifications"): one push per day in the morning
 * (default 07:00 local), only on days with a planned workout, naming it; a weather hint is merged
 * into the same push, never a second one. Pure selection and texts; `functions/daily-reminders`
 * reads the rows and sends.
 *
 * The app uploads the texts for the coming days (`reminder_days`, in the user's language, with the
 * weather line from the forecast on the device – the location never leaves it). The server only
 * checks that the named workout is still planned that day and falls back to a plain English text
 * when the app has not uploaded one.
 */

export interface NotificationSettingsRow {
  user_id: string;
  daily_reminder: boolean;
  /** Local time of day in minutes after midnight (420 = 07:00). */
  reminder_minute: number;
  /** IANA time zone of the user's device, e.g. Europe/Zurich. */
  time_zone: string;
  weather_hint: boolean;
}

export interface WorkoutRow {
  plan_id: string;
  id: string;
  date: string;
  status: 'planned' | 'done' | 'skipped';
  deleted: boolean;
  data: { sport?: string; role?: string; durationMin?: number; commuteId?: string };
}

export interface PlanRow {
  id: string;
  deleted: boolean;
  updated_at: string;
  pauses: { startDate: string; endDate: string | null }[];
}

export interface ReminderDayRow {
  date: string;
  workout_id: string;
  title: string;
  body: string | null;
  weather: string | null;
}

export interface LocalClock {
  /** Local calendar date (YYYY-MM-DD). */
  date: string;
  /** Minutes after local midnight. */
  minute: number;
}

/** How long after the reminder time a late run may still send it (cron gaps, deploys). */
export const SEND_WINDOW_MIN = 180;

/** The user's local date and time; an unknown time zone counts as UTC. */
export function localClock(now: Date, timeZone: string): LocalClock {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    return localClock(now, 'UTC');
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Due now: turned on, past today's reminder time, still within the send window. */
export function isDue(settings: NotificationSettingsRow, clock: LocalClock): boolean {
  if (!settings.daily_reminder) return false;
  return (
    clock.minute >= settings.reminder_minute &&
    clock.minute < settings.reminder_minute + SEND_WINDOW_MIN
  );
}

const isPaused = (plan: PlanRow, date: string) =>
  plan.pauses.some((p) => date >= p.startDate && (p.endDate === null || date < p.endDate));

/**
 * Today's workout to name: planned (not done, skipped or deleted) in the current plan (the most
 * recently updated one that is not deleted), not inside a pause. Sessions before commutes – a
 * commute alone is transport, not a workout day. Null on rest days.
 */
export function pickWorkout(
  workouts: readonly WorkoutRow[],
  plans: readonly PlanRow[],
  date: string,
): WorkoutRow | null {
  const plan = [...plans]
    .filter((p) => !p.deleted)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (!plan || isPaused(plan, date)) return null;
  const today = workouts.filter(
    (w) =>
      w.plan_id === plan.id &&
      w.date === date &&
      w.status === 'planned' &&
      !w.deleted &&
      w.data.commuteId === undefined &&
      w.data.role !== 'commute',
  );
  // Longest first: the main session of a double day.
  today.sort((a, b) => (b.data.durationMin ?? 0) - (a.data.durationMin ?? 0));
  return today[0] ?? null;
}

const SPORT_NAMES: Record<string, string> = {
  run: 'Run',
  bike: 'Ride',
  swim: 'Swim',
  strength: 'Strength session',
  brick: 'Brick session',
};

export interface ReminderMessage {
  title: string;
  body: string;
  workoutId: string;
}

/**
 * The push: the app's text when it names this workout, else a plain English fallback. The weather
 * line (if any, and turned on) becomes the body – one push, never a second one for the weather.
 */
export function reminderMessage(
  workout: WorkoutRow,
  day: ReminderDayRow | null,
  weatherHint: boolean,
): ReminderMessage {
  const own = day && day.workout_id === workout.id ? day : null;
  const name = SPORT_NAMES[workout.data.sport ?? ''] ?? 'Workout';
  const minutes = workout.data.durationMin;
  const title = own?.title ?? `Today: ${name}${minutes ? `, ${Math.round(minutes)} min` : ''}`;
  const weather = weatherHint ? (own?.weather ?? null) : null;
  const body = weather ?? own?.body ?? 'Open Peakr for the steps and targets.';
  return { title, body, workoutId: workout.id };
}
