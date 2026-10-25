-- Phase 8b: generated round trips (CLAUDE.md "Terrain intelligence" §2b).
--
-- 1. The route library accepts routes the user saved from the generated round trips.
-- 2. Provider results are cached per user and snapped start point (~100 m) / distance, so opening
--    the same session again costs no routing call. Only the Edge Function `round-trips` reads and
--    writes the cache (service role); rows go with the account and expire after 14 days.

alter table public.routes drop constraint routes_source_check;
alter table public.routes add constraint routes_source_check
  check (source in ('gpx', 'strava', 'strava_route', 'komoot', 'generated'));

create table public.route_cache (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- `ors:<profile>:<lat>:<lon>:<distance>:<count>` with the start on a ~100 m grid.
  key text not null check (length(key) <= 128),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

comment on table public.route_cache is
  'Generated round trips per user and snapped start point (written by round-trips only).';

create index route_cache_created on public.route_cache (user_id, created_at);

-- RLS on, no policies: no access for the app or the website.
alter table public.route_cache enable row level security;
