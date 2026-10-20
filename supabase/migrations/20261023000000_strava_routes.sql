-- Phase 8: routes the athlete planned in Strava's route builder.
--
-- `strava_routes` mirrors the athlete's Strava routes (rides and runs) with their exported GPX, so
-- the app can add them to the route library (`routes.source = 'strava_route'`). Only Edge
-- Functions write here (on connect, "sync now", nightly, `strava-sync/routes`); a route that is no
-- longer listed at Strava becomes a tombstone. The app pulls rows by `server_updated_at`.
--
-- Private routes need the `read_all` scope; athletes who connected before it was requested only
-- see their public routes until they reconnect.
--
-- Strava API Agreement: routes are used only for the owner's plan, no other user can read them
-- (RLS), they are never used to train AI/ML models, and they are deleted (tombstoned) on
-- disconnect, on deauthorisation at Strava and with the account.

create table public.strava_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Strava's `id_str` (route ids do not fit a JavaScript number).
  external_id text not null check (length(external_id) between 1 and 64),
  -- Null on deleted rows (tombstones keep no route data).
  name text check (length(name) <= 200),
  sport text check (sport in ('run', 'bike')),
  distance_m real check (distance_m >= 0),
  elevation_gain_m real check (elevation_gain_m >= 0),
  private boolean not null default false,
  -- Strava's last change of the route; a new value triggers a new GPX export.
  strava_updated_at timestamptz,
  gpx text check (length(gpx) <= 5242880),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Pull cursor of the app (same idea as activities).
  server_updated_at timestamptz not null default now(),
  unique (user_id, external_id),
  constraint strava_routes_live check (deleted or (sport is not null and gpx is not null))
);

comment on table public.strava_routes is
  'Routes planned in Strava with their GPX. Written by Edge Functions only; own rows readable.';

create index strava_routes_sync on public.strava_routes (user_id, server_updated_at);

-- Same stamp as activities: server time on every write is the app's pull cursor.
create trigger strava_routes_stamp before insert or update on public.strava_routes
  for each row execute function public.activities_stamp();

alter table public.strava_routes enable row level security;

create policy "Users read their own Strava routes"
  on public.strava_routes for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.strava_routes from anon, authenticated;
grant select on public.strava_routes to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The route library also keeps imported Strava routes (source 'strava' = recognised from
-- activities, 'strava_route' = planned in Strava's route builder).

alter table public.routes drop constraint routes_source_check;
alter table public.routes add constraint routes_source_check
  check (source in ('gpx', 'strava', 'strava_route', 'komoot'));
