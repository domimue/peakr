import type { PlanState } from '@peakr/engine';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { todayIso } from '@/data/ids';
import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { useEntitlement } from '@/features/billing/billing-store';
import { useReminderSettings } from '@/features/notifications/queries';
import { reminderWorkout } from '@/features/notifications/reminder-days';
import { useReminderExtras } from '@/features/notifications/reminder-extras';
import { addDays } from '@/features/plan/calendar';
import { usePlan } from '@/features/plan/queries';

import { useCheckInSettings } from './queries';

export const CHECKIN_NOTIFICATION_TYPE = 'body-checkin';
/** Same horizon as the daily reminder texts. */
const DAYS_AHEAD = 14;

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/**
 * Which measuring days get which reminder: days with a workout reminder from the server carry
 * the check-in as an extra line (never a second push); the others get one local notification at
 * the reminder time.
 */
export function checkInReminderPlan(input: {
  today: string;
  measureWeekday: number;
  /** The server sends a workout reminder (account, reminder on). */
  dailyReminder: boolean;
  plan: PlanState | null;
}): { merged: string[]; local: string[] } {
  const merged: string[] = [];
  const local: string[] = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = addDays(input.today, i);
    if (weekdayOf(date) !== input.measureWeekday) continue;
    const workout = input.plan ? reminderWorkout(input.plan, date) : null;
    (input.dailyReminder && workout ? merged : local).push(date);
  }
  return { merged, local };
}

/**
 * Body check-in reminder on the measuring day (mounted once in the root layout). Only while the
 * add-on can be used and the user wants it; switching either off removes every pending one.
 */
export function BodyCheckInReminder() {
  const { t } = useTranslation();
  const guard = useEntitlement('body_nutrition');
  const userId = useSessionStore(selectAccountUserId);
  const { data: settings } = useCheckInSettings();
  const { data: reminder } = useReminderSettings();
  const { data: stored } = usePlan();
  const setLines = useReminderExtras((s) => s.setLines);
  const scheduled = useRef<string | null>(null);
  const active = guard.visible && guard.canWrite && Boolean(settings?.reminder);

  useEffect(() => {
    if (!settings || !reminder) return;
    const today = todayIso();
    const plan = active
      ? checkInReminderPlan({
          today,
          measureWeekday: settings.measureWeekday,
          dailyReminder: Boolean(userId) && reminder.enabled,
          plan: stored?.state ?? null,
        })
      : { merged: [], local: [] };
    const line = t('bodyAddon.checkIn.reminderLine');
    setLines(Object.fromEntries(plan.merged.map((d) => [d, line])));

    const key = JSON.stringify([plan.local, reminder.minute, t('bodyAddon.checkIn.reminderTitle')]);
    if (Platform.OS === 'web' || scheduled.current === key) return;
    scheduled.current = key;
    void (async () => {
      const list = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        list
          .filter((n) => n.content.data?.type === CHECKIN_NOTIFICATION_TYPE)
          .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
      );
      const now = Date.now();
      for (const date of plan.local) {
        const [y, m, d] = date.split('-').map(Number) as [number, number, number];
        const at = new Date(y, m - 1, d, Math.floor(reminder.minute / 60), reminder.minute % 60);
        if (at.getTime() <= now) continue;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: t('bodyAddon.checkIn.reminderTitle'),
            body: t('bodyAddon.checkIn.reminderBody'),
            data: { type: CHECKIN_NOTIFICATION_TYPE },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
        });
      }
    })().catch(() => {
      scheduled.current = null;
    });
  }, [active, settings, reminder, stored, userId, t, setLines]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string } | undefined;
      if (data?.type === CHECKIN_NOTIFICATION_TYPE) router.push('/body/check-in/new');
    });
    return () => subscription.remove();
  }, []);

  return null;
}
