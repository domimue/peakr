# Phase 9d – Health tab: Garmin health data in Peakr

## Context
Peakr should show the body and recovery data the watch already records (sleep, HRV, resting HR,
stress, steps, SpO2, respiration, body composition, VO2max …) so the user no longer needs Garmin
Connect next to it (CLAUDE.md "Health", "UI patterns", Garmin part of "Integrations"). Today the repo
has: a Garmin OAuth provider (`supabase/functions/_shared/providers.ts`, behind `WATCH_GARMIN_*`
flags, unverified endpoints in `_shared/watch/contracts.ts`), a Health Connect provider that only
*writes* gym sessions (`apps/mobile/src/features/health/`), robust stats in the engine
(`packages/engine/src/stats.ts`: `median`, `quantile`, `mad`, `trimmedMean`, `theilSen`), and a
`Progress` tab with a `history | performance` segmented control
(`apps/mobile/src/features/progress/progress-screen.tsx`). Nothing health-related is stored yet.

## 1. What I could verify about the Garmin API (report)

**Limitation:** developer.garmin.com, developerportal.garmin.com and all blogs are blocked by this
container's network policy (proxy 403). Primary source I *could* read: Garmin's own official client
`github.com/garmin/connect-personal-api-python` (Apache 2.0, © Garmin 2026). Everything else comes
from search-result summaries and is marked as such. The Health API Swagger (Starter tier) is behind
the portal login – I could not read it.

### Personal tier – confirmed from Garmin's official client
- Base `https://personal.connectapi.garmin.com`. Token: `POST /personalapitoken-service/personal-api/personal-api-key/token`
  with header `Authorization: ApiKey <key>` → a JWT bearer token (expiry in the `exp` claim).
- **No refresh token.** Access token valid 24 h (or until the key expires); a new one is minted
  from the key. Keys expire after 30/90/180/365 days (user picks), Garmin emails ~1 week before.
  (FAQ, via search summary.) ⇒ the key itself must be stored server-side (encrypted) to re-mint.
- **Pull only**, no webhooks. Health endpoints that exist (GET, `YYYY-MM-DD`):
  | Data | Endpoint | Granularity |
  |---|---|---|
  | Daily summaries (steps, floors, intensity min, calories, resting HR …) | `/usersummary-service/v2/dailysummaries?startDate&endDate` | per day, range |
  | Steps | `/usersummary-service/stats/steps/daily/{start}/{end}` | per day, range |
  | Stress | `/usersummary-service/stats/stress/daily/{start}/{end}` | per day, range |
  | Heart rate (incl. resting) | `/wellness-service/wellness/dailyHeartRate?date` | one day, intraday |
  | HRV | `/hrv-service/hrv/{date}` and `/hrv-service/hrv/daily/{start}/{end}` | night readings / daily summary |
  | Sleep | `/sleep-service/sleep/dailySleep?date`, `/sleep-service/sleep/dailySleepSummariesByDate?startDate&endDate` | per night incl. stages / range |
  | Body Battery | `/wellness-service/wellness/bodyBattery/reports/daily?startDate&endDate` | per day |
  | SpO2 | `/wellness-service/wellness/daily/spo2acclimation/{date}` | one day |
  | Weight / body composition | `/weight-service/weight/range/{start}/{end}?includeAll=true` | per measurement |
  | Fitness age | `/fitnessage-service/fitnessage/v2/{date}` | per day |
  | Menstrual cycle (women's health) | `/periodichealth-service/menstrualcycle/summary/{date}`, `/dayview/{date}` | per day |
  | Also: hydration, food logs, weight goals, HR zones, profile, activities + FIT download | | |
- **Not in the client:** respiration, VO2max, Training Readiness, Training Status, HRV status label
  beyond what `/hrv` returns, skin temperature. They may exist in the Swagger – I'll call only what
  the Swagger lists and leave the rest as "not provided".
- **Rate limits: not published.** Per-call range caps reported by third parties (7 days for
  steps/stress, 28 for sleep/Body Battery – sources disagree). **History depth: not documented.**
  ⇒ chunk requests to 7 days, back off on 429, record the earliest date actually returned and show it.
- **Terms for a third-party app:** the FAQ (per a search summary) says the Personal API is "for
  individual users accessing their own data, not for commercial applications serving multiple end
  users"; one guide says the key may only be used "in tools you run yourself"; the Developer
  Program Agreement forbids making the API available to third parties without written approval.
  **Conclusion: not allowed for Peakr users as far as I can tell; fine for you on your own data.**
  As you asked: key mode gets built, behind a developer flag, **off by default**, never offered to
  normal users. Please read the Personal API terms page yourself – I could not open it.

### Starter tier (Health API) – not verifiable here, from secondary sources
- OAuth 2.0 with **PKCE** (Garmin PDF "OAuth2PKCE"), user grants per-permission consent; after the
  token exchange the app fetches the user id and granted permissions; there are **user-permission**
  and **deregistration** endpoints/notifications. Token lifetime / refresh not confirmed.
- Delivery: **push** (JSON summaries POSTed to callback URLs you register per summary type) – no
  pull. Summary types: `dailies`, `epochs` (15 min), `sleeps` (stages), `stressDetails` (3 min;
  Body Battery per some sources), `hrv`, `userMetrics` (VO2max, fitness age), `bodyComps`,
  `pulseox`, `allDayRespiration`, `bloodPressures`, `skinTemp`, `healthSnapshot`, women's health.
- **No backfill on Starter** (Open Wearables; Enterprise has 1 month+). ⇒ data starts on the
  connection day; UI says so. One report: unverified label and limited new connections until Garmin
  reviews the app.
- Training Readiness / Training Status: in **no** source for either tier ⇒ treated as missing.

## 2. Architecture

### Server (Supabase)
- **Migration `20261028000000_health.sql`**
  - `health_consents (user_id, group, enabled, enabled_at)` – groups: `sleep`, `hrv_rhr`, `stress`,
    `activity`, `spo2_resp`, `body_comp`, `womens_health` (default off, separate explicit toggle).
  - `health_daily (user_id, metric, day, source, source_ids text[], recorded_at, value_enc, updated_at)`
    unique `(user_id, metric, day, source)`; `value_enc` = AES-GCM JSON (value + detail, e.g. sleep
    stages) via the existing `encryptToken` helpers with a separate `HEALTH_ENCRYPTION_KEY`.
    RLS: owner select only; writes only by service role.
  - `health_sync_state (user_id, source, earliest_day, last_pulled_at, last_error)` → drives
    "data goes back to …".
  - `integration_tokens` reused for the encrypted personal key; `integrations.provider='garmin'` gets
    a `credential_mode` column (`oauth|personal_key`).
  - pg_cron job every 2 h → `garmin-health/pull` (same pattern as `strava-sync/nightly`).
- **`_shared/health/`** (pure TS, contract-tested with fixtures):
  - `provider.ts` – `GarminHealthProvider` interface: `fetchRange(user, groups, from, to)` /
    `parsePush(type, body)` → `HealthRecord[]`, `revoke()`.
  - `garmin-personal.ts` – key → token (cache token until `exp − 1 h`), the endpoint table above,
    7-day chunking, 429 backoff, maps JSON → metrics.
  - `garmin-oauth.ts` – reuses the `garmin` OAuth provider (PKCE) + push parser per summary type;
    endpoint/field names collected in one `GARMIN_HEALTH` contract object (unverified, same
    approach as `watch/contracts.ts`).
  - `map.ts` – one canonical metric list: `sleep_duration`, `sleep_stages`, `sleep_score`,
    `bed_time`, `wake_time`, `hrv_night`, `resting_hr`, `stress_avg`, `steps`, `floors`,
    `intensity_min`, `active_kcal`, `spo2_avg`, `respiration_avg`, `weight`, `body_fat`,
    `muscle_mass`, `vo2max`, `body_battery` (only if Garmin returns it, labelled as Garmin's),
    `fitness_age`, cycle data. Only metrics the API actually delivers are mapped.
- **Edge Function `garmin-health`**: `connect-key` (dev flag `GARMIN_PERSONAL_KEY=1` server-side;
  validates by minting a token, stores key encrypted), `consent`, `pull` (cron + "sync now"),
  `backfill` (personal: walk back in 7-day chunks up to 12 months until empty; OAuth: none),
  `delete` (all health rows + sync state, keep account), `export-list` (decrypts rows for the
  app since a cursor). Push receiver for Starter in `watch-webhook` (route `garmin-health/*`,
  answers 200 immediately, processes after) behind `GARMIN_HEALTH=1`.
- Disconnect Garmin and `delete-account` call the same health delete (+ deregistration for OAuth).

### Health Connect as second source (Android)
- Extend `features/health/types.ts` with `readDaily(metrics, from, to)`; `health.android.ts` requests
  **read** permissions only for the enabled groups (SleepSession, HeartRateVariabilityRmssd,
  RestingHeartRate, Steps, FloorsClimbed, OxygenSaturation, RespiratoryRate, Weight, BodyFat,
  Vo2Max). iOS stub returns unsupported (HealthKit comes with iOS). Records written by Peakr are
  skipped (`isOwnHealthRecord`).
- Manifest permissions added in the Expo config plugin only for those record types.

### App data
- SQLite tables (Drizzle, `schema.ts` + migration test like `gym-migration`): `health_daily`
  (decrypted locally, per metric/day/source) and `health_sync_state`. Repository
  `health-repository.ts` + mock, TanStack queries in `features/health-data/queries.ts`.
- **Dedup**: one value per metric/day chosen by source priority `garmin > healthConnect`, all
  source ids kept (`resolveDaily` in the engine).

### Engine (`packages/engine/src/health/`, Vitest)
- `baseline.ts` – per metric: rolling median + normal band over 30 and 90 days from
  `median`/`mad` (band = median ± 1.5·1.4826·MAD, clamped to [p10, p90] fallback), min. data days
  (e.g. 14/30 – below that "not enough data"), gaps ignored, outliers can't move the band.
- `deviation.ts` – today's value vs. band → `within | slightly_off | clearly_off` + direction,
  with metric-specific "bad direction" (RHR up, HRV down, sleep down).
- `trend.ts` – 7-day vs. 30-day median and `theilSen` slope → `up | flat | down`.
- `recovery.ts` – combines RHR, HRV, sleep → `normal | slightly_off | clearly_off` + reason keys
  ("Resting HR 6 bpm above your baseline"); missing inputs reduce confidence, never invent.
  Returns a **suggestion** (`makeEasier`) only; nothing writes to the plan.
- `resolve.ts` – source-priority dedup. All tests incl. gaps, outliers, ties, too-little-data.
- Thresholds in one config object (like `config.ts`).

### Screens
- **Progress tab → Insights** (route rename, i18n `tabs.insights`), segments **Health | Training |
  Records**; Training = today's `history`, Records = today's `performance` (moved, not rewritten).
  Opens on Health once a Garmin/Health Connect source is connected, else Training.
- `features/insights/health/`:
  - `health-overview.tsx` – tiles (value, unit, trend arrow vs. baseline, recording time + source
    line, tabular nums), "data goes back to <date>" line, sync-now.
  - `metric-detail.tsx` (route `app/health/[metric].tsx`) – 7 d / 30 d / 12 mo victory-native
    charts with baseline band, value list with time + source.
  - `sleep-detail.tsx` – duration, stages bar, bed/wake times, week pattern.
  - RHR & HRV detail – line chart with hard sessions (Z4+, intervals, long, race from plan/
    activities) marked as dots in the workout-type colour, named in the legend.
  - `body-comp-detail.tsx` – only when scale data exists.
  - Empty/partial states per metric with the concrete reason: not connected · group not enabled ·
    "your Garmin connection does not provide this" · no data recorded (watch not worn) · not
    enough days for a baseline.
- **Consent screen** `app/health/consent.tsx` – one row per group listing exactly the metrics
  read, women's health separate and off; shown before the first pull; editable later in
  Profile → Connections → Garmin. Delete-all-health-data button (confirm step) in the same place.
- **Garmin connect screen** – OAuth button (flag `garminHealth`, off until Starter approval);
  "Paste personal API key" only when dev flag `garminPersonalKey` is on (app flag + server flag).
- **Today workout card** – one recovery line when `clearly_off` ("Resting HR 7 bpm above your
  baseline, HRV below it"), button "Make today easier" → confirm sheet → existing downgrade path of
  the plan engine; "If this keeps up, talk to a doctor." on clearly-off values. No other wording.
- All strings in `en.json`; no hex outside `/packages/theme`.

### Rules enforced
- No diagnosis: copy review + a unit test that scans `health.*` i18n strings for banned words
  (ill, sick, disease, risk, infection, overtraining, …).
- Entitlement `training` gates the Health segment (same `RequireEntitlement` as the plan).
- Never shared, never used for training models – stated in consent screen and privacy text update
  (`apps/web` legal page section for Garmin health data).

## 3. Delivery (small commits, one PR)
1. Engine `health/` + tests. 2. Migration + `_shared/health` with fixture tests. 3. Edge function
`garmin-health` (personal key path, dev flag) + delete + account deletion. 4. SQLite + repository +
sync. 5. Insights tab rename + Health overview/details/consent. 6. Health Connect read.
7. Today recovery line. 8. `docs/health-garmin.md` (report above, setup steps, flags).

## 4. What you do in Garmin
**Personal tier (for you, now):** Garmin Connect Web → Settings → Personal API token
(`connect.garmin.com/app/settings/personalApiToken`) → create key (choose 90 days), copy it once.
Set server secrets `GARMIN_PERSONAL_KEY=1`, `HEALTH_ENCRYPTION_KEY`, dev build with
`garminPersonalKey` on, paste key in the app. Read the Personal API terms + FAQ.
**Starter tier (product):** developer portal → apply for Starter Access → create app, ask for
Health (+ Women's Health only if you want it), Activity, Training, Courses → register redirect
URI `…/functions/v1/oauth/callback` and a push callback URL per summary type
(`…/functions/v1/watch-webhook/garmin-health/<type>`) plus deregistration + user-permission
callbacks → send me the Health API Swagger/PDF so I can correct `GARMIN_HEALTH` → set
`GARMIN_CLIENT_ID/SECRET`, `GARMIN_HEALTH=1`, app flag `garminHealth`.
**Check against your watch:** compare 3 days in Garmin Connect vs. Peakr: sleep duration and
stage minutes, bed/wake time (time zone!), resting HR, overnight HRV avg, steps, stress avg,
weight; check the "goes back to" date; disable a group and confirm it stops updating; delete
health data and confirm the tiles empty out.

## Verification
- `pnpm lint && pnpm typecheck && pnpm test` (engine Vitest, app Jest incl. screen tests for
  overview/empty states/consent/recovery line, Deno tests for `_shared/health` parsers against
  fixtures built from the official client's endpoint shapes).
- Manual: dev build with personal key against your account; `supabase functions serve` + cron
  call; deletion leaves the account intact.
