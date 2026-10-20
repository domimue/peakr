-- Phase 8c: weather check (CLAUDE.md "Real-life & seasonal adaptation" 4).
--
-- Hourly forecasts cached per location cell and hour, so many users in the same area (and the same
-- user opening the app several times) cost one provider call per hour. Only the Edge Function
-- `weather` reads and writes here (service role). Locations are rounded to a ~5 km grid before
-- they become a key, and rows carry no user id: the cache cannot tell who asked.

create table public.weather_cache (
  -- `<provider>:<lat>:<lon>` with lat/lon rounded to the grid.
  cell text not null check (length(cell) <= 64),
  -- Start of the UTC hour the forecast was fetched in.
  hour timestamptz not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (cell, hour)
);

create index weather_cache_hour on public.weather_cache (hour);

-- RLS on, no policies: no access for the app or the website.
alter table public.weather_cache enable row level security;
