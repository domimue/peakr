-- Phase 8: terrain intelligence – activity streams for the grade-adjusted per-km evaluation and
-- route recognition, and the route library as a synced table.
--
-- `activity_streams` holds the elevation profile of an imported outdoor run or ride: distance,
-- altitude, time and heart rate, downsampled at import to points ~25 m apart (Edge Function
-- `_shared/strava-streams.ts`), plus the track as an encoded polyline. One row per activity per
-- source, keyed like `activities`. Only Edge Functions write here (webhook import, "sync now",
-- `strava-sync/streams`); the app pulls rows by `server_updated_at` like activities.
--
-- Strava API Agreement: streams are used only for the owner's evaluation and route library, no
-- other user can read them (RLS), they are never used to train AI/ML models, and they are deleted
-- (tombstoned) together with the activity, on disconnect and on deauthorisation at Strava.

create table public.activity_streams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('strava', 'garmin', 'coros', 'suunto')),
  external_id text not null check (length(external_id) between 1 and 64),
  -- Parallel arrays, one entry per kept point. Null on deleted rows (tombstones keep no data).
  distance_m real[],
  altitude_m real[],
  time_s integer[],
  -- 0 where the sensor had no reading (the arrays stay parallel).
  heartrate real[],
  -- Encoded polyline (Google format, precision 5) of the kept points.
  latlng text,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Pull cursor of the app (same idea as activities).
  server_updated_at timestamptz not null default now(),
  unique (user_id, source, external_id),
  constraint activity_streams_points check (
    deleted
    or (
      distance_m is not null
      and altitude_m is not null
      and cardinality(distance_m) between 2 and 20000
      and cardinality(altitude_m) = cardinality(distance_m)
      and (time_s is null or cardinality(time_s) = cardinality(distance_m))
      and (heartrate is null or cardinality(heartrate) = cardinality(distance_m))
    )
  )
);

comment on table public.activity_streams is
  'Downsampled distance/altitude/time/HR streams of imported outdoor activities. Edge Functions write; own rows readable.';

create index activity_streams_sync on public.activity_streams (user_id, server_updated_at);

-- Same stamp as activities: server time on every write is the app's pull cursor.
create trigger activity_streams_stamp before insert or update on public.activity_streams
  for each row execute function public.activities_stamp();

alter table public.activity_streams enable row level security;

create policy "Users read their own activity streams"
  on public.activity_streams for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.activity_streams from anon, authenticated;
grant select on public.activity_streams to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Routes: the user's own route library (GPX import, recognised Strava routes, Komoot later),
-- now synced like plans: ids are created on the device (text), the device's `updated_at` decides
-- conflicts (last write wins), deletions are soft so other devices learn about them.
--
-- The Phase 6 table had a server-side uuid key and no sync columns, and nothing ever wrote to it,
-- so it is replaced. The guard stops the migration instead of dropping rows if it has any.

do $$
begin
  if exists (select 1 from public.routes) then
    raise exception 'public.routes is not empty – migrate its rows before replacing the table';
  end if;
end;
$$;

drop table public.routes;

create table public.routes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (length(id) between 1 and 64),
  name text not null check (length(name) between 1 and 200),
  sport text not null check (sport in ('run', 'bike')),
  source text not null check (source in ('gpx', 'strava', 'komoot')),
  distance_m real not null check (distance_m >= 0),
  gain_m real not null default 0 check (gain_m >= 0),
  loss_m real not null default 0 check (loss_m >= 0),
  start_lat double precision check (start_lat between -90 and 90),
  start_lon double precision check (start_lon between -180 and 180),
  -- Encoded polyline (Google format) of the simplified track.
  polyline text,
  -- Elevation profile and detected climbs as computed by @peakr/engine (opaque to the server).
  profile jsonb,
  climbs jsonb,
  -- Where the route came from, e.g. the Strava activities it was recognised from ('strava:123').
  source_keys text[] not null default '{}' check (cardinality(source_keys) <= 500),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.routes is
  'Route library of a user (GPX, recognised Strava routes, Komoot); synced from the app, last write wins.';

create index routes_sync on public.routes (user_id, server_updated_at);

create trigger routes_last_write_wins before insert or update on public.routes
  for each row execute function public.sync_last_write_wins();

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
