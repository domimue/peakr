import {
  allWorkouts,
  isPaused,
  statusOf,
  type PlanState,
  type UserProfile,
  type WeatherForecast,
  type Workout,
} from '@peakr/engine';
import type { TFunction } from 'i18next';

import { addDays } from '../plan/calendar';
import { mainZone } from '../plan/components/workout-card';
import { durationText, workoutTitle } from '../onboarding/workout-text';
import { weatherLine } from '../weather/reminder-line';
import type { WeatherSettings } from '../weather/settings';

/**
 * The texts of the daily reminder for the coming days, in the user's language (uploaded to
 * `reminder_days`; the server sends one of them each morning). "Today: Easy run, 50 min, Zone 2",
 * plus the weather line on days with a hint.
 */

export interface ReminderDay {
  date: string;
  workoutId: string;
  title: string;
  body: string;
  weather: string | null;
}

/** How far ahead texts are uploaded – the app opens at least that often while training. */
export const REMINDER_DAYS_AHEAD = 14;
/** The forecast is used for today and the next two days; further out it changes too much. */
const WEATHER_DAYS = 3;

/** The session the reminder names: the longest planned one, sessions before commutes. */
export function reminderWorkout(state: PlanState, date: string): Workout | null {
  if (isPaused(state, date)) return null;
  const day = allWorkouts(state.plan).filter(
    (w) =>
      w.date === date &&
      statusOf(state, w.id) === 'planned' &&
      w.commuteId === undefined &&
      w.role !== 'commute',
  );
  day.sort((a, b) => b.durationMin - a.durationMin);
  return day[0] ?? null;
}

export function reminderTitle(t: TFunction, w: Workout): string {
  const zone = w.sport === 'strength' ? null : mainZone(w);
  const parts = [workoutTitle(t, w), durationText(t, w)];
  if (zone !== null) parts.push(t('notifications.reminder.zone', { zone }));
  return t('notifications.reminder.title', { workout: parts.join(', ') });
}

export function reminderDays(
  t: TFunction,
  language: string,
  state: PlanState,
  profile: UserProfile,
  forecast: WeatherForecast | null,
  weather: WeatherSettings,
  today: string,
): ReminderDay[] {
  const out: ReminderDay[] = [];
  for (let i = 0; i < REMINDER_DAYS_AHEAD; i++) {
    const date = addDays(today, i);
    const w = reminderWorkout(state, date);
    if (!w) continue;
    const line =
      forecast && weather.enabled && i < WEATHER_DAYS
        ? weatherLine(t, language, forecast, state, w, profile, weather.sessionHour)
        : null;
    out.push({
      date,
      workoutId: w.id,
      title: reminderTitle(t, w),
      body: t('notifications.reminder.body'),
      weather: line,
    });
  }
  return out;
}
