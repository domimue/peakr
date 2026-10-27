import { allWorkouts } from '@peakr/engine';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import type { TFunction } from 'i18next';
import { AppState, Platform } from 'react-native';

import type { ActivityNotice } from '@/data/activities/apply';
import { daysBetween, todayIso } from '@/data/ids';
import * as planRepo from '@/data/repositories/plan-repository';
import * as settingsRepo from '@/data/repositories/settings-repository';
import i18n from '@/i18n';

import { formatDate } from '../plan/calendar';
import { calendarTitle } from '../plan/kind';
import { distanceText } from '../settings/units';

/**
 * Congratulation after a session (CLAUDE.md "Account & notifications"): its own category beside
 * the daily reminder. Sent only when a synced activity was linked to a planned session with
 * confidence – never for an open "Which session was this?" – at most once per session, and not
 * for a session the user had already marked done. In the foreground the in-app notice says it
 * already, so nothing is shown, but the session still counts as congratulated.
 */

export const CONGRATS_TYPE = 'congrats';
export const CONGRATS_CHANNEL = 'congrats';
/** Only recent sessions: a first sync of older activities sends nothing. */
const MAX_AGE_DAYS = 1;
/** Remembered workout ids (oldest dropped). */
const KEEP_SENT = 200;

/** The confident links of this sync that still deserve a congratulation. */
export function congratsFor(
  notices: readonly ActivityNotice[],
  sent: ReadonlySet<string>,
  today = todayIso(),
): ActivityNotice[] {
  const seen = new Set(sent);
  return notices.filter((n) => {
    if (n.kind !== 'matched' || !n.workoutId || n.wasDone) return false;
    const age = daysBetween(n.date, today);
    if (age < 0 || age > MAX_AGE_DAYS || seen.has(n.workoutId)) return false;
    seen.add(n.workoutId);
    return true;
  });
}

export interface CongratsText {
  title: string;
  body: string;
}

/** "Nice work" / "Long run on Thursday is done – 14.2 km." */
export function congratsText(
  t: TFunction,
  workoutTitle: string,
  notice: ActivityNotice,
  units: 'metric' | 'imperial',
  language: string,
  today = todayIso(),
): CongratsText {
  const day =
    notice.date === today
      ? t('notifications.congrats.today')
      : t('notifications.congrats.onDay', {
          day: formatDate(notice.date, language, { weekday: 'long' }),
        });
  const km = notice.distanceM ? notice.distanceM / 1000 : 0;
  const body =
    km >= 0.1
      ? t('notifications.congrats.bodyDistance', {
          title: workoutTitle,
          day,
          distance: distanceText(t, units, km),
        })
      : t('notifications.congrats.body', { title: workoutTitle, day });
  return { title: t('notifications.congrats.title'), body };
}

export async function ensureCongratsChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CONGRATS_CHANNEL, {
    name,
    importance: AndroidImportance.DEFAULT,
  });
}

/** Listener for new activities (registered at module scope, so it runs in the background too). */
export async function congratulate(notices: readonly ActivityNotice[]): Promise<void> {
  if (Platform.OS === 'web') return;
  const reminder = await settingsRepo.getReminderSettings();
  if (!reminder.congrats) return;
  const sent = await settingsRepo.getCongratsSent();
  const due = congratsFor(notices, new Set(sent));
  if (due.length === 0) return;
  await settingsRepo.saveCongratsSent(
    [...sent, ...due.map((n) => n.workoutId as string)].slice(-KEEP_SENT),
  );
  // The user is looking at the app: the in-app notice is the congratulation.
  if (AppState.currentState === 'active') return;

  const [stored, app] = await Promise.all([planRepo.getPlan(), settingsRepo.getAppSettings()]);
  if (!stored) return;
  const workouts = new Map(allWorkouts(stored.state.plan).map((w) => [w.id, w]));
  const t = i18n.t.bind(i18n) as TFunction;
  await ensureCongratsChannel(t('notifications.congrats.channel'));
  for (const notice of due) {
    const workout = workouts.get(notice.workoutId as string);
    if (!workout) continue;
    const text = congratsText(t, calendarTitle(t, workout), notice, app.units, i18n.language);
    await Notifications.scheduleNotificationAsync({
      identifier: `${CONGRATS_TYPE}-${workout.id}`,
      content: { ...text, data: { type: CONGRATS_TYPE, workoutId: workout.id } },
      trigger: Platform.OS === 'android' ? { channelId: CONGRATS_CHANNEL } : null,
    });
  }
}
