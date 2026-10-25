-- Daily workout reminder (CLAUDE.md "Account & notifications"): one push per day in the morning,
-- only on workout days, naming the workout, weather merged in. See functions/daily-reminders.

-- ---------------------------------------------------------------------------------------------
-- Per-user settings, written by the app (Profile → Notifications). The time zone comes from the
-- device and is updated whenever it changes (travel), so "07:00" is always the user's 07:00.

create table public.notification_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  daily_reminder boolean not null default true,
  reminder_minute smallint not null default 420 check (reminder_minute between 0 and 1439),
  time_zone text not null default 'UTC' check (length(time_zone) between 1 and 64),
  weather_hint boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.notification_settings is
  'Daily reminder on/off, local time (minutes after midnight), device time zone, weather line.';

create trigger notification_settings_touch before update on public.notification_settings
  for each row execute function public.touch_updated_at();

alter table public.notification_settings enable row level security;

create policy "Users read their own notification settings"
  on public.notification_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own notification settings"
  on public.notification_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own notification settings"
  on public.notification_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.notification_settings from anon, authenticated;
grant select, insert, update on public.notification_settings to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The reminder text per day, written by the app for the coming days in the user's language: the
-- workout it names and the weather line computed on the device (only the text is uploaded, never
-- the location). The server checks the workout is still planned before using it.

create table public.reminder_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  workout_id text not null check (length(workout_id) between 1 and 128),
  title text not null check (length(title) between 1 and 200),
  body text check (length(body) <= 300),
  weather text check (length(weather) <= 300),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

comment on table public.reminder_days is
  'Daily reminder texts for the coming days (app-written, user language, incl. weather line).';

create trigger reminder_days_touch before update on public.reminder_days
  for each row execute function public.touch_updated_at();

alter table public.reminder_days enable row level security;

create policy "Users read their own reminder days"
  on public.reminder_days for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users write their own reminder days"
  on public.reminder_days for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own reminder days"
  on public.reminder_days for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users remove their own reminder days"
  on public.reminder_days for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.reminder_days from anon, authenticated;
grant select, insert, update, delete on public.reminder_days to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Reminders sent: one row per user and local date, written before the push, so there is never
-- more than one per day. Service role only.

create table public.daily_reminders (
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  workout_id text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

comment on table public.daily_reminders is 'Daily workout reminders sent (one per user and day).';

alter table public.daily_reminders enable row level security;
revoke all on public.daily_reminders from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Every 15 minutes: the function sends to everyone whose local reminder time has passed today.
-- Old rows go after 60 days (texts for past days, sent markers).

select cron.schedule(
  'daily-workout-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/daily-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'daily-reminders-cleanup',
  '43 4 * * *',
  $$
  delete from public.daily_reminders where local_date < current_date - 60;
  delete from public.reminder_days where date < current_date - 7;
  $$
);
