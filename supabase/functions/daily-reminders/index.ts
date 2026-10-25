/**
 * Daily workout reminder (CLAUDE.md "Account & notifications"): one push per day in the morning,
 * only on days with a planned workout, naming it, with the weather hint merged in.
 *
 *   POST /daily-reminders  (x-cron-secret: CRON_SECRET)  → { due, sent }
 *
 * Called every 15 minutes by pg_cron (see the migration). For every user whose local reminder
 * time (their own time zone) has passed today, it picks today's planned workout and sends one
 * push to all their devices. `daily_reminders` has one row per user and local date, written
 * before the push: never two in a day, even when runs overlap or one is retried. Only users with
 * an active plan subscription (or trial) get it – after it ends the plan is read-only.
 *
 * `verify_jwt = false` because the cron call carries a secret instead of a JWT.
 */

import {
  isDue,
  localClock,
  pickWorkout,
  reminderMessage,
  type NotificationSettingsRow,
  type PlanRow,
  type ReminderDayRow,
  type WorkoutRow,
} from '../_shared/reminders/daily.ts';
import { pushToUser } from '../_shared/push.ts';
import { adminClient, json } from '../_shared/supabase.ts';

type Admin = ReturnType<typeof adminClient>;

async function remindUser(
  admin: Admin,
  settings: NotificationSettingsRow,
  date: string,
): Promise<boolean> {
  const { data: entitled, error: entitlementError } = await admin.rpc('has_entitlement', {
    uid: settings.user_id,
    name: 'training',
  });
  if (entitlementError) throw entitlementError;
  if (entitled !== true) return false;

  const [plans, workouts, day] = await Promise.all([
    admin.from('plans').select('id, deleted, updated_at, pauses').eq('user_id', settings.user_id),
    admin
      .from('workouts')
      .select('plan_id, id, date, status, deleted, data')
      .eq('user_id', settings.user_id)
      .eq('date', date),
    admin
      .from('reminder_days')
      .select('date, workout_id, title, body, weather')
      .eq('user_id', settings.user_id)
      .eq('date', date)
      .maybeSingle(),
  ]);
  if (plans.error) throw plans.error;
  if (workouts.error) throw workouts.error;
  if (day.error) throw day.error;

  const workout = pickWorkout(
    (workouts.data ?? []) as WorkoutRow[],
    (plans.data ?? []) as PlanRow[],
    date,
  );
  if (!workout) return false;

  // Claim the day first: a second run (or a retry) finds the row and sends nothing.
  const { data: claimed, error: claimError } = await admin
    .from('daily_reminders')
    .upsert(
      { user_id: settings.user_id, local_date: date, workout_id: workout.id },
      { onConflict: 'user_id,local_date', ignoreDuplicates: true },
    )
    .select('user_id');
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return false;

  const message = reminderMessage(
    workout,
    (day.data ?? null) as ReminderDayRow | null,
    settings.weather_hint,
  );
  await pushToUser(
    admin,
    settings.user_id,
    { type: 'reminder', workoutId: message.workoutId },
    { title: message.title, body: message.body },
    { alwaysAlert: true, channelId: 'reminder' },
  );
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'not_found' }, 404);
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }
  const admin = adminClient();
  const now = new Date();
  try {
    const { data, error } = await admin
      .from('notification_settings')
      .select('user_id, daily_reminder, reminder_minute, time_zone, weather_hint')
      .eq('daily_reminder', true);
    if (error) throw error;
    const due = ((data ?? []) as NotificationSettingsRow[])
      .map((s) => ({ settings: s, clock: localClock(now, s.time_zone) }))
      .filter((c) => isDue(c.settings, c.clock))
      .map((c) => ({ settings: c.settings, date: c.clock.date }));
    if (due.length === 0) return json({ due: 0, sent: 0 });

    // Skip who already got today's (their local today) reminder without loading their plan.
    const { data: sentRows, error: sentError } = await admin
      .from('daily_reminders')
      .select('user_id, local_date')
      .in(
        'user_id',
        due.map((c) => c.settings.user_id),
      )
      .in('local_date', [...new Set(due.map((c) => c.date))]);
    if (sentError) throw sentError;
    const sent = new Set((sentRows ?? []).map((r) => `${r.user_id}|${r.local_date}`));

    let count = 0;
    for (const c of due) {
      if (sent.has(`${c.settings.user_id}|${c.date}`)) continue;
      try {
        if (await remindUser(admin, c.settings, c.date)) count++;
      } catch (e) {
        // One user's failure must not stop the others; the next run (same window) retries them.
        console.warn('Daily reminder failed', c.settings.user_id, String(e));
      }
    }
    return json({ due: due.length, sent: count });
  } catch (error) {
    console.error('daily-reminders failed', String(error));
    return json({ error: 'internal' }, 500);
  }
});
