-- Phase 9d: body and recovery data (CLAUDE.md "Health"). Daily values per metric from Garmin,
-- kept apart from activities. Health Connect / HealthKit values stay on the device (the app reads
-- them itself) and are deduplicated there against these rows.
--
-- Health data is sensitive: every value is encrypted by the Edge Function `garmin-health`
-- (AES-GCM, key in the Supabase secret HEALTH_ENCRYPTION_KEY) before it is stored. Users can read
-- their own rows only through that function; nothing here is ever shown to anyone else.

-- ---------------------------------------------------------------------------------------------
-- How Peakr talks to Garmin for this user: OAuth (Starter tier, the product path) or a personal
-- API key the user pasted (Personal tier, developer flag only). The rest of the app never sees it.

alter table public.integrations
  add column credential_mode text not null default 'oauth'
    check (credential_mode in ('oauth', 'personal_key'));

comment on column public.integrations.credential_mode is
  'oauth = provider OAuth; personal_key = Garmin Personal API key (stored encrypted in integration_tokens.refresh_token).';

-- ---------------------------------------------------------------------------------------------
-- Opt-in per data group. A group without a row is off. Women's health is never switched on by
-- default; the app asks for it separately.

create table public.health_consents (
  user_id uuid not null references auth.users (id) on delete cascade,
  "group" text not null
    check ("group" in ('sleep', 'hrv_rhr', 'stress', 'activity', 'spo2_resp', 'body_comp', 'womens_health')),
  enabled boolean not null default false,
  changed_at timestamptz not null default now(),
  primary key (user_id, "group")
);

comment on table public.health_consents is 'Which health data groups the user allows Peakr to read.';

alter table public.health_consents enable row level security;

create policy "Users read their own health consents"
  on public.health_consents for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.health_consents from anon, authenticated;
grant select on public.health_consents to authenticated;

-- ---------------------------------------------------------------------------------------------
-- One value per metric, day and source. `value_enc` holds the encrypted JSON
-- { value, detail } (detail e.g. sleep stages, bed and wake time). Service role only: the app
-- reads decrypted rows through `garmin-health/list`.

create table public.health_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  metric text not null check (length(metric) <= 40),
  day date not null,
  source text not null check (source in ('garmin')),
  -- The summary ids the value came from at the source.
  source_ids text[] not null default '{}',
  -- When the source recorded the value (shown next to every number).
  recorded_at timestamptz not null,
  value_enc text not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, metric, day, source)
);

comment on table public.health_daily is 'Encrypted daily health values per metric and source. Service role only.';

create index health_daily_sync on public.health_daily (user_id, server_updated_at);

-- The app pulls rows changed since its last cursor, so every write stamps the server time.
create function public.health_daily_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

create trigger health_daily_stamp before insert or update on public.health_daily
  for each row execute function public.health_daily_stamp();

alter table public.health_daily enable row level security;
revoke all on public.health_daily from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Sync bookkeeping per user and source: how far back the data goes (shown in the app) and where
-- the backfill stands.

create table public.health_sync_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('garmin')),
  -- Earliest day with any value; null until data arrived.
  earliest_day date,
  -- Personal tier: the backfill walks back from here; null when finished.
  backfill_before date,
  backfill_done boolean not null default false,
  last_pulled_at timestamptz,
  last_error text check (length(last_error) <= 300),
  updated_at timestamptz not null default now(),
  primary key (user_id, source)
);

comment on table public.health_sync_state is 'Health sync progress per user and source.';

create trigger health_sync_state_touch before update on public.health_sync_state
  for each row execute function public.touch_updated_at();

alter table public.health_sync_state enable row level security;

create policy "Users read their own health sync state"
  on public.health_sync_state for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.health_sync_state from anon, authenticated;
grant select on public.health_sync_state to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Scheduled pull for connections without push (Garmin Personal tier): every 2 hours, the Edge
-- Function fetches the last days of every connected user. URL and secret come from Vault, like the
-- Strava catch-up.

select cron.schedule(
  'garmin-health-pull',
  '17 */2 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/garmin-health/cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
