-- Phase 7c: weight-training activities from Strava come in as summary sessions.
-- Additive only: existing rows keep their data (summary = false, rpe = null).

-- 'strength' joins the imported sports.
alter table public.activities drop constraint activities_sport_check;
alter table public.activities add constraint activities_sport_check
  check (sport in ('run', 'bike', 'swim', 'walk', 'xcski', 'skitour', 'snowshoe', 'strength'));

-- The source has the session but not its content (Strava weight training has no sets), so a
-- detailed record of the same session always wins over it in the app.
alter table public.activities add column summary boolean not null default false;

-- Session RPE 1–10 if the athlete set "perceived exertion" on Strava; strength load uses it.
alter table public.activities add column rpe real check (rpe between 1 and 10);
