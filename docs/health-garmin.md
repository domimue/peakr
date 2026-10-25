# Health data from Garmin (Phase 9d)

Insights → Health shows the body and recovery data the watch records, compared with the user's own
history. This page is the API report, what ships and what is switched off, and what you do in
Garmin Connect and the Garmin developer portal.

## What I could verify about the Garmin API

**Limitation first:** developer.garmin.com, developerportal.garmin.com and the blogs about the
October 2026 relaunch are blocked by the network policy of the container I worked in. The one
primary source I could read in full is Garmin's own **official Personal API client**,
[github.com/garmin/connect-personal-api-python](https://github.com/garmin/connect-personal-api-python)
(Apache 2.0, © Garmin 2026). Everything marked *secondary* below comes from search-result summaries
and must be checked against the portal. The Health API reference and Swagger (Starter tier) sit
behind the portal login – I could not read them.

### Personal tier (verified from Garmin's client unless marked)

| | |
| --- | --- |
| Access | Self-service. The user creates a key in Garmin Connect Web: Settings → Personal API token (`connect.garmin.com/app/settings/personalApiToken`). Shown once. |
| Token | `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` with `Authorization: ApiKey <key>` → the bearer token (JWT) as plain text; expiry in its `exp` claim. **No refresh token** – a new token is minted from the key. *Secondary (FAQ):* token valid 24 h or until the key expires; keys expire after 30, 90, 180 or 365 days (the user chooses), Garmin emails about a week before. |
| Delivery | **Pull only.** No webhooks. |
| Health endpoints | daily summaries (`/usersummary-service/v2/dailysummaries?startDate&endDate`), steps and stress per day (ranges), daily heart rate incl. resting HR (one day), HRV (`/hrv-service/hrv/{date}` and `/hrv-service/hrv/daily/{start}/{end}`), sleep (`/sleep-service/sleep/dailySleep?date`, `…/dailySleepSummariesByDate?startDate&endDate`), **Body Battery** (`/wellness-service/wellness/bodyBattery/reports/daily`), SpO2 (one day), weight/body composition (`/weight-service/weight/range/{start}/{end}?includeAll=true`), fitness age, menstrual cycle summary and day view, hydration, food logs, weight goals, HR zones, profile, activities and their FIT files. |
| Granularity | Per day; heart rate, HRV and sleep also with the readings of the day/night. |
| History depth | **Not documented.** Peakr walks back in 28-day steps up to 365 days and stops when two steps before the earliest value come back empty; the app shows "Data from <date> on". |
| Rate limits | **Not published.** *Secondary:* per-call range caps of 7 days for steps/stress and 28 for sleep/Body Battery (sources disagree). Peakr asks for 7 days per call, only the endpoints the switched-on groups need, stops on the first 429 and limits a scheduled run to 400 calls. |
| Not in the client | Respiration as its own endpoint (Peakr reads the waking average from the daily summary if present), **VO2max**, **Training Readiness**, **Training Status**, skin temperature. Peakr shows these as "not provided" instead of inventing them. They may still be in the Swagger – call `garmin-health/probe` and tell me. |

**JSON field names are not verified.** The mappers read the Garmin Connect DTO names as publicly
known (`totalSteps`, `restingHeartRate`, `sleepTimeSeconds`, `deepSleepSeconds`, `lastNightAvg`,
`bodyBatteryHighestValue` …), defensively: a missing field gives no value, never a zero. The
developer route `GET /garmin-health/probe?date=YYYY-MM-DD` returns Garmin's raw responses for one
day, so we can compare them with the mappers. Correcting a field is one line in
`supabase/functions/_shared/health/garmin-personal.ts` plus its fixture in
`packages/health/src/garmin-health.test.ts`.

### Can a user paste their own personal key into Peakr?

**As far as I can tell: no.** *Secondary:* Garmin's Personal API FAQ is quoted as saying the API is
"for individual users accessing their own data" and "not intended for commercial applications
serving multiple end users"; a guide summarises the terms as "the key is personal to you, for
tools you run for your own use"; the Developer Program Agreement forbids making the API available to
third parties without Garmin's written approval. I could not open the terms page myself, so please
read `developer.garmin.com/gc-developer-program/personal/` (terms and FAQ) and decide.

So, as you asked: the key mode is built, but **behind a developer flag and off by default** – it
needs the server secret `GARMIN_PERSONAL_KEY=1` **and** the app flag `garminPersonalKey`, and the UI
labels it "Developer". It is for you and early testers on your own accounts, never offered to users.

### Starter tier (secondary – not verifiable from here)

- OAuth 2.0 with **PKCE**; the user grants permissions one by one; after the token exchange the app
  reads the Garmin user id and the granted permissions. There are user-permission-change and
  deregistration notifications. Token lifetime and refresh: not confirmed (Peakr's OAuth provider
  refreshes like the others).
- Delivery: **push** – Garmin POSTs JSON summaries to callback URLs per summary type after the watch
  syncs. Summary types: `dailies`, `epochs` (15 min), `sleeps` (with stages), `stressDetails`
  (3 min; Body Battery per some sources), `hrv`, `userMetrics` (VO2max, fitness age), `bodyComps`,
  `pulseox`, `allDayRespiration`, `bloodPressures`, `skinTemp`, `healthSnapshot`, women's health.
- **No backfill on Starter** (Enterprise has a month or more) – data starts on the connection day,
  and the app says so. One report: Starter apps carry an "unverified" label and may have new
  connections limited until Garmin reviews them.
- Training Readiness / Training Status: in no source for either tier → treated as missing.

## What ships

| Part | Where |
| --- | --- |
| Engine: personal baseline (rolling median + MAD band over 30 and 90 days, minimum 14/30 values, minimum spread per metric), deviation, trend, recovery signal (resting HR, HRV, sleep → normal / slightly off / clearly off, with reasons), source-priority dedup | `packages/engine/src/health/` |
| `GarminHealthProvider` with the two credential modes (OAuth push / personal key pull), parsers, pull schedule | `supabase/functions/_shared/health/` (tested in `packages/health`) |
| Tables `health_consents`, `health_daily` (encrypted values), `health_sync_state`; `integrations.credential_mode`; pull every 2 h | `supabase/migrations/20261028000000_health.sql` |
| Edge Function `garmin-health` (status, connect/disconnect key, consent, sync, cron, list, delete, probe) and push route `watch-webhook/garmin-health` | `supabase/functions/` |
| Health Connect as the second source (last 30 days, only the switched-on groups, values stay on the phone, Garmin wins on the same day) | `apps/mobile/src/features/health/` |
| Insights tab (Health · Training · Records), overview, detail per metric, sleep, resting HR / HRV with hard sessions, body composition, settings, Today's recovery line | `apps/mobile/src/features/insights/` |

Rules kept: values are compared only with the user's own history; no text names a condition or
says someone is ill (a test scans every Health string); "if this keeps up, talk to a doctor"
appears only next to a clearly unusual value; nothing changes the plan without a confirmation;
each group is opted into separately and switching it off deletes its data; women's health is off;
all health data can be deleted without deleting the account; disconnecting Garmin, a Garmin
deregistration and account deletion remove it too; it is part of the base Training subscription
(no extra entitlement). Women's health can be switched on, but Peakr reads and shows no cycle
data yet.

## What you do

### Personal tier – for you, now

1. Garmin Connect **Web** → Settings → **Personal API token**
   (`https://connect.garmin.com/app/settings/personalApiToken`) → create a key, expiry 90 days.
   Copy it – it is shown only once.
2. Read the Personal API terms and FAQ (see above).
3. Supabase → Edge Functions → Secrets:
   - `HEALTH_ENCRYPTION_KEY` = `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   - `GARMIN_PERSONAL_KEY=1`
   - `CRON_SECRET` and the Vault entries `project_url` / `cron_secret` exist already (Strava
     catch-up); the new pull job uses them.
4. `supabase db push` (migration `20261028000000_health.sql`) and
   `supabase functions deploy garmin-health watch-webhook oauth delete-account`.
5. The personal build (docs/personal-build.md) shows the key mode automatically (flag
   `garminPersonalKey` is on there; in a development build set it to `true` by hand). Sign in,
   then Insights → Health → "Set up health data" → paste the key under "Developer" → switch on the
   groups → Save. The backfill runs in the background ("Fetching your older data").
6. Send me the output of `GET /functions/v1/garmin-health/probe?date=<yesterday>` (with your user
   JWT) or of `gc-personal daily-summaries / sleep-summaries / hrv-summaries / weight-measurements`
   from Garmin's CLI – I then confirm or correct the field names.

### Starter tier – the product path

1. Garmin developer portal → **Connect Developer Program → Starter Access** → apply as a business
   (Swiss sole proprietorship), describe Peakr, request **Health** (and Activity, Training, Courses
   for the watch features). Women's Health only if you want it later.
2. Create the app; register the OAuth redirect URI
   `https://<project>.supabase.co/functions/v1/oauth/callback`.
3. Register one push callback for every Health summary type (dailies, sleeps, hrv, bodyComps,
   pulseox, allDayRespiration, userMetrics) **and** for deregistrations and user-permission changes:
   `https://<project>.supabase.co/functions/v1/watch-webhook/garmin-health?key=<WATCH_WEBHOOK_SECRET>`
   (one URL for all; Peakr reads the type from the body). Choose **push**, not ping.
4. Download the Health API reference / Swagger and send it to me: I correct `GARMIN_HEALTH` and the
   mappers in `_shared/health/garmin-push.ts`, the OAuth endpoints in `_shared/watch/contracts.ts`,
   and the `provides` list in `_shared/health/model.ts` (e.g. whether Body Battery is in it).
5. Secrets `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `GARMIN_HEALTH=1`; app flag `garminHealth`.
6. Plan the move to Enterprise before 1,000 users (CLAUDE.md "Integrations").

### Check against your own watch data

Pick three recent days and compare Garmin Connect with Peakr:

- **Sleep:** total time asleep, minutes of deep / light / REM / awake, bed and wake time (watch the
  time zone – the times must be your local times), and which day the night is filed under (Peakr
  and Garmin: the morning you woke up).
- **Resting HR** and **overnight HRV** (Garmin's "last night average", not the 7-day average).
- **Steps**, **floors**, **intensity minutes** (Garmin counts vigorous minutes double), **stress**
  average, **Body Battery** high/low, **SpO2**, **respiration**, **weight / body fat** from the scale.
- The "Data from … on" date against the oldest day Garmin Connect shows.
- Switch a group off → its tiles disappear and stay gone after "Sync now".
- "Delete all health data" → the tiles empty out, your plan and account stay.
- Wear the watch less one night → that day shows "Nothing recorded" instead of a zero.
- Baselines appear after 14 days with data; before that the tile says how many days it still needs.

## Not verified here

- The Edge Functions were type-checked with `deno check` but never run against Supabase or Garmin.
- All Garmin JSON field names (both tiers) and the Starter push format.
- Health Connect reading needs a development build on a phone (the mapping is unit-tested).
- No imperial units for weight yet (metric only, like the rest of the Health screens).
