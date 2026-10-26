import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { todayIso } from '@/data/ids';
import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';

import { usePlan } from '../plan/queries';
import { useForecast, useWeatherSettings } from '../weather/queries';
import { askNotificationPermission, ensureReminderChannel } from './permission';
import { useReminderSettings } from './queries';
import { reminderDays } from './reminder-days';
import { useReminderExtras } from './reminder-extras';
import { deviceTimeZone, uploadReminderDays, uploadReminderSettings } from './reminder-remote';

const TYPE = 'reminder';
/** Local weather notifications of the earlier version; the daily reminder replaced them. */
const LEGACY_TYPE = 'weather';

/**
 * Keeps the daily workout reminder on the server in line with this device (mounted once in the
 * root layout): the settings with the current time zone, and the texts of the coming days from
 * the plan and the forecast. The server sends at most one push per morning. Tapping it opens the
 * workout.
 */
export function DailyReminder() {
  const { t, i18n } = useTranslation();
  const userId = useSessionStore(selectAccountUserId);
  const { data: settings } = useReminderSettings();
  const { data: stored } = usePlan();
  const { data: weather } = useWeatherSettings();
  const { data: forecast } = useForecast();
  const extras = useReminderExtras((s) => s.lines);
  const sentSettings = useRef<string | null>(null);
  const sentDays = useRef<string | null>(null);

  useEffect(() => {
    void ensureReminderChannel(t('notifications.reminder.channel')).catch(() => undefined);
    if (Platform.OS === 'web') return;
    void Notifications.getAllScheduledNotificationsAsync()
      .then((list) =>
        Promise.all(
          list
            .filter((n) => n.content.data?.type === LEGACY_TYPE)
            .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
        ),
      )
      .catch(() => undefined);
  }, [t]);

  // Settings and time zone (checked on every change and start – the user may have travelled).
  useEffect(() => {
    if (!userId || !settings) return;
    const timeZone = deviceTimeZone();
    const key = JSON.stringify([userId, settings, timeZone]);
    if (sentSettings.current === key) return;
    void uploadReminderSettings(userId, settings, timeZone).then((ok) => {
      if (ok) sentSettings.current = key;
    });
  }, [userId, settings]);

  // With a plan and the reminder on: ask for the permission once, in context.
  useEffect(() => {
    if (userId && stored && settings?.enabled) void askNotificationPermission();
  }, [userId, stored, settings?.enabled]);

  // The texts of the coming days.
  useEffect(() => {
    if (!userId || !stored || !weather) return;
    const today = todayIso();
    const days = reminderDays(
      t,
      i18n.language,
      stored.state,
      stored.input.profile,
      forecast?.status === 'ok' ? forecast.forecast : null,
      weather,
      today,
    ).map((d) => (extras[d.date] ? { ...d, body: `${d.body} ${extras[d.date]}` } : d));
    const key = JSON.stringify([userId, today, days]);
    if (sentDays.current === key) return;
    void uploadReminderDays(userId, days, today).then((ok) => {
      if (ok) sentDays.current = key;
    });
  }, [t, i18n.language, userId, stored, weather, forecast, extras]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        { type?: string; workoutId?: string } | undefined;
      if (
        (data?.type === TYPE || data?.type === LEGACY_TYPE) &&
        typeof data.workoutId === 'string'
      ) {
        router.push(`/training/workout/${encodeURIComponent(data.workoutId)}`);
      }
    });
    return () => subscription.remove();
  }, []);

  return null;
}
