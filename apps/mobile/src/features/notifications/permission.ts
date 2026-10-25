import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Android channel of the daily workout reminder (the server sends with this channel id). */
export const REMINDER_CHANNEL = 'reminder';

/** The channel must exist before a push for it arrives (Android 8+). */
export async function ensureReminderChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name,
    importance: AndroidImportance.DEFAULT,
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function notificationPermission(): Promise<PermissionState> {
  if (Platform.OS === 'web') return 'denied';
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    return current.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Shows the system prompt if it may still be shown; true when notifications are allowed. */
export async function askNotificationPermission(): Promise<boolean> {
  const state = await notificationPermission();
  if (state !== 'undetermined') return state === 'granted';
  try {
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}
