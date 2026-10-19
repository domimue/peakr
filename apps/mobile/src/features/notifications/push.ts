import Constants from 'expo-constants';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { supabase } from '@/data/supabase';

/**
 * Expo push for synced activities. Every device registers its token; the server sends a silent
 * push that wakes the app to sync (see `background-task.ts`). A visible notification only when the
 * user turned on "Notify me" (CLAUDE.md: activity notifications are in-app unless enabled).
 */

interface PushState {
  /** This device's Expo push token, once registered. */
  token: string | null;
  activityAlerts: boolean;
}

export const usePushStore = create<PushState>()(() => ({ token: null, activityAlerts: false }));

const CHANNEL = 'activities';

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Registers this device for pushes of the signed-in user. `ask` shows the permission prompt
 * (only when the user connects a service, never on start); silent pushes work without it.
 */
export async function registerPushToken(userId: string, ask = false): Promise<string | null> {
  if (!supabase || Platform.OS === 'web') return null;
  const id = projectId();
  if (!id) {
    console.warn('No EAS projectId – run `eas init`; push notifications are off');
    return null;
  }
  try {
    if (Platform.OS === 'android') {
      // Android 13+ shows the permission prompt only once a channel exists.
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Synced activities',
        importance: AndroidImportance.DEFAULT,
      });
    }
    if (ask) {
      const current = await Notifications.getPermissionsAsync();
      if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    const { data, error } = await supabase
      .from('push_tokens')
      .upsert(
        { token, user_id: userId, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
        { onConflict: 'token' },
      )
      .select('activity_alerts')
      .single();
    if (error) throw new Error(error.message);
    usePushStore.setState({ token, activityAlerts: data.activity_alerts === true });
    return token;
  } catch (error) {
    // Offline or no push service (emulator without Google Play): sync still works in the app.
    console.warn('Push registration failed', error);
    return null;
  }
}

/** "Notify me when an activity syncs" for this device. */
export async function setActivityAlerts(enabled: boolean): Promise<boolean> {
  const { token } = usePushStore.getState();
  if (!supabase || !token) return false;
  if (enabled) {
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return false;
  }
  const { error } = await supabase
    .from('push_tokens')
    .update({ activity_alerts: enabled })
    .eq('token', token);
  if (error) return false;
  usePushStore.setState({ activityAlerts: enabled });
  return true;
}

/** Signing out: this device no longer receives the account's pushes. */
export async function unregisterPushToken(): Promise<void> {
  const { token } = usePushStore.getState();
  if (!supabase || !token) return;
  await supabase.from('push_tokens').delete().eq('token', token);
  usePushStore.setState({ token: null, activityAlerts: false });
}
