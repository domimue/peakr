import type { RestTimer } from '@peakr/engine';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import i18n from '@/i18n';

/**
 * The rest timer's end as a local notification (CLAUDE.md "Gym": finishes with a notification and
 * haptic feedback). Scheduled for the timer's end time, so it fires while the app is in the
 * background or closed; skip and +15 s replace it. In the foreground the timer bar shows it and
 * vibrates instead (see `background-task.ts`: no banner for `type: 'rest'`).
 */

const CHANNEL = 'rest-timer';
const ID = 'gym-rest-timer';
export const REST_NOTIFICATION_TYPE = 'rest';

let asked = false;

/** Android channel and the permission prompt, once, when the first rest starts. */
async function ensurePermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: i18n.t('gym.live.rest.channel'),
        importance: AndroidImportance.HIGH,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (asked || !current.canAskAgain) return false;
    asked = true;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function cancelRestNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(ID).catch(() => undefined);
}

/** Replaces the scheduled end of rest with `timer` (null cancels it). */
export async function syncRestNotification(
  timer: RestTimer | null,
  exerciseName: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelRestNotification();
  if (!timer || timer.endsAt <= Date.now()) return;
  if (!(await ensurePermission())) return;
  await Notifications.scheduleNotificationAsync({
    identifier: ID,
    content: {
      title: i18n.t('gym.live.rest.doneTitle'),
      body: i18n.t('gym.live.rest.doneBody', { name: exerciseName }),
      data: { type: REST_NOTIFICATION_TYPE },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: timer.endsAt,
      channelId: CHANNEL,
    },
  });
}
