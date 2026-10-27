import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { onActivities } from '@/data/activities/events';
import { supabase } from '@/data/supabase';
import { requestSync } from '@/data/sync/use-background-sync';

import { CONGRATS_TYPE, congratulate } from './congrats';

/**
 * A push about a new activity wakes the app – also when it is closed – and it syncs the activity
 * into SQLite and the plan (marked done / week rebalanced) before the user opens it. Defined at
 * module scope (imported by the root layout), as TaskManager requires.
 */

export const ACTIVITY_SYNC_TASK = 'peakr-activity-sync';

TaskManager.defineTask(ACTIVITY_SYNC_TASK, async () => {
  try {
    const session = await supabase?.auth.getSession();
    const user = session?.data.session?.user;
    // An anonymous user (quiz before the account exists) has nothing to sync.
    if (user && !user.is_anonymous) await requestSync(user.id);
    return Notifications.BackgroundNotificationTaskResult.NewData;
  } catch (error) {
    console.warn('Background activity sync failed', error);
    return Notifications.BackgroundNotificationTaskResult.Failed;
  }
});

// A confident link of a synced activity gets its congratulation – also after a background sync.
onActivities((notices) => {
  congratulate(notices).catch((error: unknown) => console.warn('Congratulation not sent', error));
});

/**
 * In the foreground the in-app notice already says it: no system banner for activity pushes and
 * congratulations, and none for the end of a rest (the timer bar shows it and vibrates).
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = notification.request.content.data?.type;
    const inApp = type === 'activity' || type === 'rest' || type === CONGRATS_TYPE;
    return {
      shouldShowBanner: !inApp,
      shouldShowList: !inApp,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
});

export function registerBackgroundSync(): void {
  if (Platform.OS === 'web') return;
  Notifications.registerTaskAsync(ACTIVITY_SYNC_TASK).catch((error: unknown) =>
    console.warn('Background notification task not registered', error),
  );
}
