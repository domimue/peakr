-- Phase 9: what Peakr pushed to a user's watch platform (Garmin, COROS, Suunto).
--
-- One row per planned workout (or route) and platform, with the id the platform gave it and a hash
-- of the payload that was sent. That is what makes re-syncing on change possible: a moved or edited
-- workout is updated in place instead of duplicated, an unchanged one is not sent again, and one
-- that left the plan is removed at the platform. Only Edge Functions write here; the user can read
-- their own rows (the app shows "sent to your watch 10 minutes ago").

create table public.watch_pushes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('garmin', 'coros', 'suunto')),
  kind text not null default 'workout' check (kind in ('workout', 'route')),
  -- `WatchWorkout.id` / `WatchRoute.id` (the planned workout's id).
  item_id text not null check (length(item_id) between 1 and 128),
  -- The id at the platform, and a second one where needed (Garmin: the calendar entry).
  external_id text not null check (length(external_id) between 1 and 128),
  extra text check (length(extra) <= 128),
  hash text not null check (length(hash) <= 64),
  pushed_at timestamptz not null default now(),
  unique (user_id, provider, kind, item_id)
);

comment on table public.watch_pushes is
  'Workouts and routes pushed to watch platforms (ids + payload hash for re-sync). Edge Functions write; own rows readable.';

create index watch_pushes_user on public.watch_pushes (user_id, provider);

alter table public.watch_pushes enable row level security;

create policy "Users read their own watch pushes"
  on public.watch_pushes for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.watch_pushes from anon, authenticated;
grant select on public.watch_pushes to authenticated;
