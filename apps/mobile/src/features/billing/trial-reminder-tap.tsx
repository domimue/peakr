import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Tapping the trial-ending reminder (Edge Function `trial-reminders`) opens Profile → Subscription. */
export function TrialReminderTap() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string } | undefined;
      if (data?.type === 'trial_ending') router.push('/subscription');
    });
    return () => subscription.remove();
  }, []);
  return null;
}
