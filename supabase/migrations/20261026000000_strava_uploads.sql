-- Gym sessions posted to Strava (uploads endpoint, structured weight training).
-- One row per session and user: the state the app shows (posting / posted / failed) and the Strava
-- activity id, which the webhook and the nightly catch-up use to ignore Peakr's own uploads, so a
-- posted session never comes back as a second, imported activity.

create table public.strava_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Id of the gym session on the device (text: sessions are created offline).
  session_id text not null check (length(session_id) between 1 and 64),
  -- 'structured': JSON upload with set data. 'plain': plain weight-training activity with a
  -- summary in the description (only after the user accepted it).
  format text not null check (format in ('structured', 'plain')),
  -- Strava's upload id (structured) – polled until it carries an activity id.
  upload_id text,
  strava_activity_id text,
  status text not null default 'processing' check (status in ('processing', 'posted', 'failed')),
  -- Machine-readable reason of a failure, e.g. 'scope_missing', 'structured_unavailable'.
  error text check (length(error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id)
);

create index strava_uploads_activity on public.strava_uploads (user_id, strava_activity_id)
  where strava_activity_id is not null;

alter table public.strava_uploads enable row level security;

create policy "Users read their own Strava uploads"
  on public.strava_uploads for select to authenticated
  using ((select auth.uid()) = user_id);

-- Written only by the Edge Function (service role).
revoke all on public.strava_uploads from anon, authenticated;
grant select on public.strava_uploads to authenticated;
