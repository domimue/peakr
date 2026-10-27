# Health data from Garmin (Phase 9d)

Insights → Health shows the body and recovery data the watch records, compared with the user's own
history. This page is the API report, what ships and what is switched off, and what you do in
Garmin Connect and the Garmin developer portal.

## What I could verify about the Garmin API

**Limitation first:** developer.garmin.com and developerportal.garmin.com do not resolve from the
container I work in. Two primary-grade sources could be read in full:

- Garmin's own **official Personal API client**,
  [github.com/garmin/connect-personal-api-python](https://github.com/garmin/connect-personal-api-python)
  (Apache 2.0, © Garmin 2026): base URL, token exchange, every endpoint path.
- Garmin's **Personal API OpenAPI spec 1.0.0** (the Swagger at
  `developer.garmin.com/gc-developer-program/personal/swagger-docs/`), through the types generated
  from it in [github.com/DynamicsNinja/garminconnect-js](https://github.com/DynamicsNinja/garminconnect-js)
  (`src/generated/personal-api.ts`), which that project checked against a real account on
  2026-10-23. Field names and response shapes below come from there.

Everything marked *secondary* comes from search-result summaries and must be checked against the
portal. The Health API reference (Starter tier) sits behind the portal login – I could not read it.

### Personal tier – endpoints and what Peakr calls

| Endpoint | Delivers | Peakr |
| --- | --- | --- |
| `/usersummary-service/v2/dailysummaries?startDate&endDate` | `{ data: [ … ] }`, one object per day grouped by topic: `movement.steps.value`, `movement.floorsAscended.value`, `calories.burnedActive/burnedResting`, `heartRate.restingValue`, `intensityMinutes.moderate/vigorous`, `stress.avgLevel`, `bodyBattery.maxValue/minValue`, `respiration.avgValue`, `pulseOx.avgValue` | pulled (steps, floors, intensity minutes, active/resting kcal, resting HR, stress, Body Battery, respiration, SpO2) |
| `/sleep-service/sleep/dailySleepSummariesByDate?startDate&endDate` | sleep with stages and score | pulled |
| `/hrv-service/hrv/daily/{from}/{to}` | overnight HRV | pulled |
| `/weight-service/weight/range/{from}/{to}?includeAll=true` | `dailyWeightSummaries[].allWeightMetrics[]` (weight in g, body fat, muscle mass, BMI) | pulled |
| `/wellness-service/wellness/daily/spo2acclimation/{day}` | `averageSpO2` of one day | pulled for recent days whose summary had no SpO2 (one call per day, never in the backfill) |
| `/activitylist-service/activities/search/activities?startDate&endDate` | activities, each with Garmin's `vO2MaxValue` | pulled **only** for VO2max (Garmin's estimate of that activity; the activities are not stored) |
| `/wellness-service/wellness/bodyBattery/reports/daily`, `/usersummary-service/stats/stress/daily/…`, `/usersummary-service/stats/steps/daily/…`, `/wellness-service/wellness/dailyHeartRate` | the same values per day or the readings of the day | not pulled (the daily summary has them); in `probe` |
| `/fitnessage-service/fitnessage/v2/{day}`, hydration, nutrition, menstrual cycle, HR zones, profile, weight goals | – | not used |

**Not in the Personal API at all** (Peakr says "not provided", never recalculates): a daily
VO2max (only the per-activity estimate above), Training Readiness, Training Status, skin
temperature. Respiration and body composition have no endpoint of their own on this tier.

**Backfill:** the Personal API has no backfill request – history is read with date ranges. Peakr
walks back in 28-day steps up to 365 days and stops when two steps before the earliest value come
back empty. When the mappers change (`PARSER_VERSION` in `_shared/health/garmin-personal.ts`) the
next pull starts that walk again, and Health data settings → "Fetch older data again" does it on
demand (`POST /garmin-health/backfill`).

**Range limits** (from garminconnect-js, live-tested): daily summaries up to a year per call,
stress stats 28 days, `weight/all` only 52-week spans (Peakr uses `weight/range`). Peakr asks for
7 days per call, only the endpoints the switched-on groups need, stops on a 429 or a rejected key,
goes on with the other endpoints after any other failure, and limits a scheduled run to 400 calls.

**Token:** `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token`
with `Authorization: ApiKey <key>` → the bearer token (JWT) as plain text, expiry in its `exp`
claim, no refresh token. *Secondary (FAQ):* token valid 24 h; keys expire after 30, 90, 180 or 365
days (the user chooses).

**Scopes:** a personal key has none – it reads all of the person's own data, so every data group
is permitted. On Garmin OAuth (Starter) there is no scope parameter either: the user ticks
permissions on Garmin's consent screen (`HEALTH_EXPORT`, `ACTIVITY_EXPORT`, `MCT_EXPORT` …). Peakr
reads them after the token exchange (`GET /wellness-api/rest/user/permissions`, *secondary*) and on
every user-permission-change push, stores them in `integrations.scopes`, and does not let the user
switch on a group whose permission is missing.

### Diagnostics

`GET /garmin-health/diagnostics` returns per endpoint the last call of the recent window and of the
backfill step (time, HTTP status, records, calls, error kind – never Garmin's text), the backfill
state and the parser version. In the app it is Health data settings → "Health sync details
(developer)", behind the flag `healthDiagnostics` (on in the personal build), together with the
number of days per metric each source has on the phone. `GET /garmin-health/probe?date=…` still
returns Garmin's raw responses for one day.

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

## Empty tiles: what each one means

A tile without a current value says which of these applies – for that metric, not one sentence
for all of them:

1. **Not permitted** – Garmin OAuth only: the permission was not granted at Garmin.
2. **Not switched on** – listed once under the tiles with a "Turn on" button.
3. **Not provided** – neither the Garmin access nor the phone's health store delivers it ("Garmin
   does not provide this on Peakr's current Garmin access …").
4. **No data in the window** – with the reason of that metric: overnight (sleep, HRV), all day
   while worn (resting HR, stress, Body Battery, steps, intensity minutes), Pulse Ox setting
   (SpO2), breathing-rate watches (respiration), weigh-ins (weight, body composition), VO2max
   updates; or "the last fetch from Garmin did not work" when the last pull failed.

When an older value or a value from another source (Health Connect) exists, the tile shows it with
its day and source instead of saying nothing was recorded. Weight, body composition and VO2max
count as current for 30 days, everything else for 7.

## Not verified here

- The Edge Functions were type-checked with `deno check` but never run against Supabase or Garmin.
- The Starter push format and its field names (`_shared/health/garmin-push.ts`). The Personal API
  field names now follow the spec, but have not run against your account yet.
- The unit of `movement.floorsAscended.value` (floors, as in v1 – or metres?).
- Garmin's `user/permissions` endpoint (OAuth) – from public descriptions only.
- Health Connect reading needs a development build on a phone (the mapping is unit-tested).
- No imperial units for weight yet (metric only, like the rest of the Health screens).
