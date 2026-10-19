-- Phase 7: imported activities (Strava first; Garmin, COROS, Suunto later) and push tokens.
--
-- `activities` holds one row per activity *per source*, exactly as the source delivered it. The app
-- pulls them into SQLite and merges records of the same workout from several sources there
-- (@peakr/engine `dedupeActivities`), because Health Connect / HealthKit data only exists on the
-- phone. Only Edge Functions write here (Strava webhook, "sync now", nightly catch-up).
--
-- Strava API Agreement: activities are used only to adapt the owner's plan. No other user can read
-- them (RLS), they are never used to train AI/ML models, and they are deleted when the user
-- disconnects Strava or revokes access at Strava.

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('strava', 'garmin', 'coros', 'suunto')),
  external_id text not null check (length(external_id) between 1 and 64),
  -- Null on deleted rows (tombstones keep no activity data).
  sport text check (sport in ('run', 'bike', 'swim', 'walk', 'xcski', 'skitour', 'snowshoe')),
  -- Sport type at the source, e.g. 'TrailRun', 'VirtualRide'.
  source_type text check (length(source_type) <= 64),
  name text check (length(name) <= 300),
  start_time timestamptz,
  -- Local calendar date of the start (the plan day it belongs to).
  start_date_local date,
  duration_sec integer check (duration_sec >= 0),
  elapsed_sec integer check (elapsed_sec >= 0),
  distance_m real check (distance_m >= 0),
  elevation_gain_m real check (elevation_gain_m >= 0),
  avg_hr real check (avg_hr between 20 and 260),
  max_hr real check (max_hr between 20 and 260),
  swim_pace_sec_per_100m real check (swim_pace_sec_per_100m > 0),
  -- Encoded polyline (Google format) of the GPS track, for the route thumbnail.
  polyline text,
  indoor boolean not null default false,
  commute boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Pull cursor of the app (same idea as plans / workouts).
  server_updated_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

comment on table public.activities is
  'Imported activities, one row per source record. Written by Edge Functions only; own rows readable.';

create index activities_sync on public.activities (user_id, server_updated_at);

create function public.activities_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger activities_stamp before insert or update on public.activities
  for each row execute function public.activities_stamp();

alter table public.activities enable row level security;

create policy "Users read their own activities"
  on public.activities for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.activities from anon, authenticated;
grant select on public.activities to authenticated;

-- The app listens for new rows while it is open (Supabase Realtime respects the policy above).
alter publication supabase_realtime add table public.activities;

-- ---------------------------------------------------------------------------------------------
-- Integrations: remember when activities were last imported (shown as "last synced …").

alter table public.integrations add column last_synced_at timestamptz;

-- ---------------------------------------------------------------------------------------------
-- Expo push tokens of the user's devices. A silent push tells a closed app to sync a new
-- activity; a visible one only if the user turned on activity notifications.

create table public.push_tokens (
  token text primary key check (length(token) between 1 and 200),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  -- Visible "activity synced" notifications (CLAUDE.md: in-app only unless the user enables them).
  activity_alerts boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.push_tokens is 'Expo push tokens per device; the app registers its own.';

create index push_tokens_user on public.push_tokens (user_id);

create trigger push_tokens_touch before update on public.push_tokens
  for each row execute function public.touch_updated_at();

alter table public.push_tokens enable row level security;

create policy "Users read their own push tokens"
  on public.push_tokens for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users register their own push tokens"
  on public.push_tokens for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own push tokens"
  on public.push_tokens for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users remove their own push tokens"
  on public.push_tokens for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.push_tokens from anon, authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Nightly catch-up for missed webhooks: pg_cron calls the Edge Function `strava-sync/nightly`
-- at 03:30 UTC. URL and secret come from Vault (set once per project, see supabase/README.md);
-- without them the job simply does nothing useful.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'strava-nightly-catch-up',
  '30 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/strava-sync/nightly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
