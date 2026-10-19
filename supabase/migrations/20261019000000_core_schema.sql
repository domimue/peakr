-- Phase 6: user data. Every table belongs to one auth user and is protected by Row Level Security.
--
-- Sync model (see apps/mobile/src/data/sync): the app's SQLite database is the source for the UI.
-- Synced tables carry two timestamps:
--   updated_at         – when the row was edited on a device (sent by the app). Decides conflicts:
--                        the newest edit wins ("last write wins", per workout / per plan).
--   server_updated_at  – when the server stored the row (set here). The app pulls everything
--                        changed after its last pull by this column.
-- Deletions of synced rows are soft (`deleted = true`) so other devices learn about them.

-- ---------------------------------------------------------------------------------------------
-- Helpers

-- Keeps `updated_at` current on tables edited only on the server (profiles, routes, integrations).
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Last write wins for synced tables: an update carrying an older device timestamp than the stored
-- row is skipped (the row stays as it is). Also stamps the server time used as the pull cursor.
create function public.sync_last_write_wins()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Profiles: one row per user, created automatically on sign-up.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (length(display_name) <= 100),
  locale text not null default 'en' check (length(locale) <= 10),
  units text not null default 'metric' check (units in ('metric', 'imperial')),
  time_zone text check (length(time_zone) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Account-level settings of a user (training data lives in plans).';

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, locale, units, time_zone) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Plans: the generated training plan. Ids are created on the device (text). Weeks and pauses are
-- stored as JSON with the plan; workouts have their own table so each one syncs on its own.

create table public.plans (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (length(id) between 1 and 64),
  input jsonb not null,
  goal jsonb not null,
  start_date date not null,
  target_date date,
  notes jsonb not null default '[]',
  weeks jsonb not null default '[]',
  pauses jsonb not null default '[]',
  revision integer not null default 0 check (revision >= 0),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.plans is 'Training plans (weeks and pauses as JSON); synced from the app, last write wins.';

create index plans_sync on public.plans (user_id, server_updated_at);

create trigger plans_last_write_wins before insert or update on public.plans
  for each row execute function public.sync_last_write_wins();

-- Deleting a plan (replaced by a new quiz result) is final: a device that edited the old plan
-- offline cannot bring it back.
create function public.plans_keep_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted and not new.deleted then
    return null;
  end if;
  return new;
end;
$$;

create trigger plans_keep_deleted before update on public.plans
  for each row execute function public.plans_keep_deleted();

-- ---------------------------------------------------------------------------------------------
-- Workouts: planned sessions of a plan with their status. `data` is the engine's Workout object.

create table public.workouts (
  user_id uuid not null default auth.uid(),
  plan_id text not null,
  id text not null check (length(id) between 1 and 128),
  date date not null,
  status text not null check (status in ('planned', 'done', 'skipped')),
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, plan_id, id),
  -- The composite key makes it impossible to attach a workout to another user's plan.
  foreign key (user_id, plan_id) references public.plans (user_id, id) on delete cascade
);

comment on table public.workouts is 'Planned workouts and their status; synced per workout, last write wins.';

create index workouts_sync on public.workouts (user_id, server_updated_at);

create trigger workouts_last_write_wins before insert or update on public.workouts
  for each row execute function public.sync_last_write_wins();

-- A deleted plan (replaced by a new quiz result) no longer needs its workouts. Security definer
-- because the app role has no delete right on workouts; it only touches the plan owner's rows.
create function public.drop_workouts_of_deleted_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.workouts where user_id = new.user_id and plan_id = new.id;
  return null;
end;
$$;

create trigger plans_drop_workouts after update of deleted on public.plans
  for each row when (new.deleted and not old.deleted)
  execute function public.drop_workouts_of_deleted_plan();

-- …and workouts that a device pushes for it later are skipped.
create function public.workouts_skip_deleted_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.plans p where p.user_id = new.user_id and p.id = new.plan_id and p.deleted
  ) then
    return null;
  end if;
  return new;
end;
$$;

create trigger workouts_skip_deleted_plan before insert or update on public.workouts
  for each row execute function public.workouts_skip_deleted_plan();

alter table public.plans enable row level security;
alter table public.workouts enable row level security;

create policy "Users read their own plans"
  on public.plans for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own plans"
  on public.plans for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own plans"
  on public.plans for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users read their own workouts"
  on public.workouts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own workouts"
  on public.workouts for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own workouts"
  on public.workouts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete for the app: deletions are soft so they sync. Rows go away with the account.
revoke all on public.plans, public.workouts from anon, authenticated;
grant select, insert, update on public.plans, public.workouts to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Routes: the user's own route library (GPX import, recognised Strava routes, Komoot, generated).
-- Never visible to other users (Strava API Agreement).

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  sport text not null check (sport in ('run', 'bike')),
  source text not null check (source in ('gpx', 'strava', 'komoot', 'generated', 'manual')),
  -- Id at the source (e.g. the Strava activity a route was recognised from).
  source_id text check (length(source_id) <= 128),
  start_lat double precision check (start_lat between -90 and 90),
  start_lng double precision check (start_lng between -180 and 180),
  distance_m integer not null check (distance_m >= 0),
  elevation_gain_m integer not null default 0 check (elevation_gain_m >= 0),
  elevation_loss_m integer not null default 0 check (elevation_loss_m >= 0),
  surface text check (surface in ('road', 'trail', 'mixed')),
  -- Simplified track [[lat, lng, elevation_m], …] and per-segment gradient profile.
  track jsonb,
  segments jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);

comment on table public.routes is 'Route library of a user (own, recognised, imported, generated).';

create index routes_user on public.routes (user_id);

create trigger routes_touch before update on public.routes
  for each row execute function public.touch_updated_at();

alter table public.routes enable row level security;

create policy "Users read their own routes"
  on public.routes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own routes"
  on public.routes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own routes"
  on public.routes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete their own routes"
  on public.routes for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.routes from anon, authenticated;
grant select, insert, update, delete on public.routes to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Integrations: which services a user connected – metadata only. The app can read its own rows;
-- only Edge Functions (service role) write them, after the OAuth token exchange.

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null
    check (provider in ('strava', 'garmin', 'coros', 'suunto', 'komoot', 'hevy', 'zwift')),
  -- The user's id at the provider (e.g. Strava athlete id), needed to route webhooks.
  external_user_id text check (length(external_user_id) <= 128),
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'error')),
  -- When the current access token expires (the token itself is in integration_tokens).
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

comment on table public.integrations is 'Connected services per user (metadata only, no tokens).';

create index integrations_external on public.integrations (provider, external_user_id);

create trigger integrations_touch before update on public.integrations
  for each row execute function public.touch_updated_at();

alter table public.integrations enable row level security;

create policy "Users read their own integrations"
  on public.integrations for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.integrations from anon, authenticated;
grant select on public.integrations to authenticated;

-- OAuth tokens, encrypted by the Edge Function (AES-GCM, key in the Supabase secret
-- TOKEN_ENCRYPTION_KEY). RLS is on and there is deliberately no policy and no grant: only the
-- service role (Edge Functions) can read or write this table, never the app or the website.
create table public.integration_tokens (
  integration_id uuid primary key references public.integrations (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  updated_at timestamptz not null default now()
);

comment on table public.integration_tokens is 'Encrypted OAuth tokens. Service role only.';

create trigger integration_tokens_touch before update on public.integration_tokens
  for each row execute function public.touch_updated_at();

alter table public.integration_tokens enable row level security;
revoke all on public.integration_tokens from anon, authenticated;
