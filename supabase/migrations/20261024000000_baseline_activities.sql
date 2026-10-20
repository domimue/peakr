-- Phase 8a: baseline from past activities (plan calibration, CLAUDE.md "Baseline from past
-- activities").
--
-- `baseline_activities` holds the user's Strava runs, rides and swims of the last 60 days, read
-- once to derive starting values for the plan (weekly volume, easy pace, HRmax/LTHR estimate,
-- CSS, terrain). They are REFERENCE ONLY, never training history: deliberately a separate table
-- from `activities`, without `server_updated_at` and without Realtime, so the app's activity sync
-- never pulls them into completed sessions, load, records or plan matching. Every import replaces
-- the user's rows. Only the Edge Function `strava-baseline` writes here.
--
-- Strava API Agreement: used only for the owner's own plan, readable only by the owner (RLS),
-- never used to train AI/ML models, deleted on Strava disconnect and account deletion.

create table public.baseline_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  external_id text not null check (length(external_id) between 1 and 64),
  sport text not null check (sport in ('run', 'bike', 'swim')),
  name text check (length(name) <= 300),
  start_time timestamptz not null,
  -- Local calendar date of the start.
  start_date_local date not null,
  duration_sec integer not null check (duration_sec > 0),
  elapsed_sec integer check (elapsed_sec >= 0),
  distance_m real check (distance_m >= 0),
  elevation_gain_m real check (elevation_gain_m >= 0),
  avg_hr real check (avg_hr between 20 and 260),
  max_hr real check (max_hr between 20 and 260),
  swim_pace_sec_per_100m real check (swim_pace_sec_per_100m > 0),
  indoor boolean not null default false,
  -- Entered by hand on Strava (no device data: no HR, rough distance).
  manual boolean not null default false,
  -- Strava `workout_type`: run 0 default, 1 race, 2 long run, 3 workout; ride 10 default,
  -- 11 race, 12 workout. Races are unticked by default as outliers.
  workout_type integer,
  -- Highest rolling 20-minute mean heart rate (LTHR estimate); null without a long enough stream.
  best_20min_hr real check (best_20min_hr between 20 and 260),
  fetched_at timestamptz not null default now(),
  unique (user_id, external_id)
);

comment on table public.baseline_activities is
  'Reference-only Strava activities (last 60 days) for plan calibration. Never training history. Written by Edge Functions only; own rows readable.';

alter table public.baseline_activities enable row level security;

create policy "Users read their own baseline activities"
  on public.baseline_activities for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.baseline_activities from anon, authenticated;
grant select on public.baseline_activities to authenticated;

-- ---------------------------------------------------------------------------------------------
-- One row per user: when the baseline was last imported, and the athlete's own heart-rate zones
-- from Strava (only if they set custom zones there; Strava's defaults say nothing about them).

create table public.baseline_imports (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Strava `heart_rate` zones object ({ custom_zones, zones: [{ min, max }] }), or null.
  strava_hr_zones jsonb,
  imported_at timestamptz not null default now()
);

comment on table public.baseline_imports is
  'Last baseline import per user (+ custom Strava HR zones). Written by Edge Functions only; own row readable.';

alter table public.baseline_imports enable row level security;

create policy "Users read their own baseline import"
  on public.baseline_imports for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.baseline_imports from anon, authenticated;
grant select on public.baseline_imports to authenticated;
