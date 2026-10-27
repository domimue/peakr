-- Garmin health sync: diagnostics per endpoint and a re-run of the backfill when the parsers change.
--
-- parser_version: the version of the Personal API mappers that filled this user's data. When the
--   Edge Function ships newer mappers (a field read wrongly before), the next pull resets the
--   backfill so the history is fetched again with them. Writes are idempotent upserts.
-- endpoints: the last call per Garmin endpoint, for the recent window and the backfill step
--   ({ recent: { dailySummaries: { at, status, records, calls, error } … }, backfill: { … } }).
--   Status codes and counts only – never a value and never Garmin's response text.
-- backfill_requested_at: when the user last pressed "Fetch older data again".

alter table public.health_sync_state
  add column parser_version integer not null default 0,
  add column endpoints jsonb not null default '{}'::jsonb,
  add column backfill_requested_at timestamptz;

comment on column public.health_sync_state.parser_version is
  'Version of the Garmin Personal API mappers the stored history was fetched with.';
comment on column public.health_sync_state.endpoints is
  'Last call per Garmin endpoint (status, record count, error kind) for the diagnostics screen.';

-- Garmin OAuth: `integrations.scopes` now holds the permissions the user granted on Garmin's
-- consent screen (HEALTH_EXPORT, ACTIVITY_EXPORT, MCT_EXPORT …), read after the token exchange and
-- updated by Garmin's user-permission-change notifications.
comment on column public.integrations.scopes is
  'Granted scopes; for Garmin the permissions granted on Garmin''s consent screen.';
