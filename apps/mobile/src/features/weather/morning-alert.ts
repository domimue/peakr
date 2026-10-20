import {
  allWorkouts,
  indoorVersion,
  weatherHint,
  type PlanState,
  type UserProfile,
  type WeatherForecast,
} from '@peakr/engine';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { todayIso } from '@/data/ids';

import { addDays } from '../plan/calendar';
import { usePlan } from '../plan/queries';
import { durationText, workoutTitle } from '../onboarding/workout-text';
import { useForecast, useWeatherSettings } from './queries';
import type { WeatherSettings } from './settings';
import { hourText } from './text';

/**
 * Optional morning notification on days with a weather hint (CLAUDE.md "Account & notifications":
 * one push per day, naming the workout; weather is merged into it, never a second push). Scheduled
 * locally from the latest forecast whenever the app has one – no location leaves the device for
 * it. Once the daily workout reminder ships, it takes over this slot and adds the weather line.
 */

const TYPE = 'weather';
const CHANNEL = 'morning';
/** Today and the next two days – further out the forecast changes too much. */
const DAYS = 3;

export interface MorningAlert {
  id: string;
  /** Local trigger time. */
  at: Date;
  title: string;
  body: string;
  workoutId: string;
}

function localDate(iso: string, hour: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1, hour, 0, 0, 0);
}

/** The alerts to schedule: one per day with a hint, for its first affected session. */
export function morningAlerts(
  t: TFunction,
  language: string,
  forecast: WeatherForecast,
  state: PlanState,
  profile: UserProfile,
  settings: WeatherSettings,
  today: string,
  now: Date,
): MorningAlert[] {
  if (!settings.enabled || !settings.morningAlert) return [];
  const workouts = allWorkouts(state.plan);
  const alerts: MorningAlert[] = [];
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(today, i);
    const at = localDate(date, settings.morningHour);
    if (at <= now) continue;
    // Sessions before commutes: the notification names the main workout of the day.
    const day = workouts
      .filter((w) => w.date === date)
      .sort((a, b) => Number(a.role === 'commute') - Number(b.role === 'commute'));
    for (const w of day) {
      const hint = weatherHint(forecast, state, w, profile, settings.sessionHour);
      if (!hint) continue;
      const indoor = indoorVersion(w);
      const first = hint.actions[0];
      const option =
        first === 'indoor' && indoor
          ? t('weather.alert.indoor', { kind: t(`workout.indoor.${indoor.kind}`) })
          : first === 'skip'
            ? t('weather.alert.skip')
            : t('weather.alert.move');
      alerts.push({
        id: `${TYPE}-${date}`,
        at,
        workoutId: w.id,
        title: t('weather.alert.title', {
          workout: `${workoutTitle(t, w)}, ${durationText(t, w)}`,
        }),
        body: t('weather.alert.body', {
          reason: t(`weather.reason.${hint.reasons[0] ?? 'heavyRain'}.short`),
          time: hourText(hint.from, language),
          option,
        }),
      });
      break;
    }
  }
  return alerts;
}

/** Replaces this feature's scheduled notifications with `alerts`. */
export async function scheduleMorningAlerts(alerts: readonly MorningAlert[]): Promise<void> {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.type === TYPE)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  for (const a of alerts) {
    await Notifications.scheduleNotificationAsync({
      identifier: a.id,
      content: { title: a.title, body: a.body, data: { type: TYPE, workoutId: a.workoutId } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: a.at,
        channelId: CHANNEL,
      },
    });
  }
}

/** Turning the morning notification on: Android channel and the permission prompt. */
export async function askNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Morning reminder',
        importance: AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Keeps the scheduled morning notifications in line with the plan, the forecast and the settings
 * (mounted once in the root layout). Tapping one opens the workout.
 */
export function MorningWeatherAlerts() {
  const { t, i18n } = useTranslation();
  const { data: stored } = usePlan();
  const { data: settings } = useWeatherSettings();
  const { data: forecast } = useForecast();

  useEffect(() => {
    if (!settings || !stored) return;
    const alerts =
      forecast?.status === 'ok'
        ? morningAlerts(
            t,
            i18n.language,
            forecast.forecast,
            stored.state,
            stored.input.profile,
            settings,
            todayIso(),
            new Date(),
          )
        : [];
    // Keep what is scheduled while a refresh fails; clear it when the check or alert is off.
    if (forecast?.status !== 'ok' && settings.enabled && settings.morningAlert) return;
    scheduleMorningAlerts(alerts).catch((error: unknown) =>
      console.warn('Scheduling the morning notification failed', error),
    );
  }, [t, i18n.language, stored, settings, forecast]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        { type?: string; workoutId?: string } | undefined;
      if (data?.type === TYPE && typeof data.workoutId === 'string') {
        router.push(`/training/workout/${encodeURIComponent(data.workoutId)}`);
      }
    });
    return () => subscription.remove();
  }, []);

  return null;
}
