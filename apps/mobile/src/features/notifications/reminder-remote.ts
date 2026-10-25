import { getCalendars } from 'expo-localization';

import { supabase } from '@/data/supabase';

import type { ReminderDay } from './reminder-days';
import type { ReminderSettings } from './reminder-settings';

/**
 * The daily reminder on the server: settings with the device time zone (`notification_settings`)
 * and the texts of the coming days (`reminder_days`). Best effort – offline, the next start
 * uploads again; the server never sends more than one per day either way.
 */

/** The device's IANA time zone, e.g. Europe/Zurich (UTC when unknown). */
export function deviceTimeZone(): string {
  try {
    return getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function uploadReminderSettings(
  userId: string,
  settings: ReminderSettings,
  timeZone: string,
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('notification_settings').upsert(
    {
      user_id: userId,
      daily_reminder: settings.enabled,
      reminder_minute: settings.minute,
      time_zone: timeZone,
      weather_hint: settings.weather,
    },
    { onConflict: 'user_id' },
  );
  if (error) console.warn('Uploading the reminder settings failed', error.message);
  return !error;
}

/** Replaces the texts from `from` on: the given days are written, other days removed. */
export async function uploadReminderDays(
  userId: string,
  days: readonly ReminderDay[],
  from: string,
): Promise<boolean> {
  if (!supabase) return false;
  const { error: deleteError } = await supabase
    .from('reminder_days')
    .delete()
    .eq('user_id', userId)
    .gte('date', from)
    .not('date', 'in', `(${days.map((d) => d.date).join(',') || '1970-01-01'})`);
  if (deleteError) {
    console.warn('Clearing the reminder texts failed', deleteError.message);
    return false;
  }
  if (days.length === 0) return true;
  const { error } = await supabase.from('reminder_days').upsert(
    days.map((d) => ({
      user_id: userId,
      date: d.date,
      workout_id: d.workoutId,
      title: d.title.slice(0, 200),
      body: d.body.slice(0, 300),
      weather: d.weather?.slice(0, 300) ?? null,
    })),
    { onConflict: 'user_id,date' },
  );
  if (error) console.warn('Uploading the reminder texts failed', error.message);
  return !error;
}
