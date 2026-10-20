# Supabase

Backend of Peakr: Auth (email magic link, Google, Sign in with Apple), Postgres with Row Level
Security, and Edge Functions for everything that needs a secret.

| Path                     | What                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `migrations/`            | SQL schema. Never edit a migration that was already pushed.            |
| `functions/oauth/`       | OAuth with third-party services (Strava first): start, callback, disconnect |
| `functions/strava-webhook/` | Strava Webhook Events API: validation + activity/athlete events    |
| `functions/strava-sync/` | "Sync now", 180-day history, streams on request (user) and the nightly catch-up (pg_cron) |
| `functions/strava-baseline/` | Baseline for plan calibration: last 60 days of runs/rides/swims, reference only |
| `functions/delete-account/` | Account deletion: revokes Strava, deletes all rows and the auth user |
| `functions/_shared/`     | Token encryption, signed OAuth state, provider registry, Strava import, Expo push |
| `templates/`             | Sign-in emails (link **and** 6-digit code)                            |
| `config.toml`            | Local CLI config; the hosted project is configured in the dashboard   |

## Data model

| Table                | Who writes                     | Notes                                                       |
| -------------------- | ------------------------------ | ----------------------------------------------------------- |
| `profiles`           | trigger on sign-up, the user   | one row per user                                            |
| `plans`              | the app (sync)                 | weeks + pauses as JSON; soft delete, deletion is final      |
| `workouts`           | the app (sync)                 | one row per planned workout; last write wins per workout    |
| `routes`             | the app (sync)                 | own route library (GPX, recognised Strava routes); soft delete, last write wins |
| `integrations`       | Edge Functions only            | metadata of connected services; the user can read own rows  |
| `integration_tokens` | Edge Functions only            | AES-GCM encrypted tokens; no access for app or website      |
| `activities`         | Edge Functions only            | one row per source record; own rows readable, Realtime on   |
| `activity_streams`   | Edge Functions only            | distance/altitude/time/HR of outdoor runs and rides, ~25 m apart; own rows readable |
| `strava_routes`      | Edge Functions only            | routes planned in Strava (rides, runs) with their GPX; own rows readable |
| `baseline_activities` | Edge Functions only           | reference-only Strava activities (last 60 days) for plan calibration; never synced as history, no Realtime; own rows readable |
| `baseline_imports`   | Edge Functions only            | last baseline import per user + custom Strava HR zones; own row readable |
| `push_tokens`        | the app (own device)           | Expo push tokens + "notify me" per device                   |
| `waitlist`           | the website (insert only)      | Phase 1b                                                    |

Sync (app side: `apps/mobile/src/data/sync`): SQLite stays the source for the UI. Every edit marks
rows dirty with a device timestamp (`updated_at`); the app pushes dirty rows, then pulls rows whose
`server_updated_at` is newer than its cursor. A trigger keeps the newer `updated_at` when two
devices write the same row, so the newest edit wins per workout.

## Commands

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <your-project-ref>
pnpm exec supabase db push
pnpm exec supabase functions deploy oauth
pnpm exec supabase functions deploy strava-webhook
pnpm exec supabase functions deploy strava-sync
pnpm exec supabase functions deploy delete-account
pnpm exec supabase functions deploy strava-baseline
pnpm exec supabase secrets set --env-file supabase/functions/.env
```

New schema changes go into a new file: `pnpm exec supabase migration new <name>`.

## One-time setup in the dashboards

### Supabase

1. **Authentication → URL Configuration**: Site URL = the website (e.g. `https://peakr.ch`).
   Redirect URLs: add `peakr://**` (app callbacks such as `peakr://auth/callback`).
2. **Authentication → Emails → Templates**: paste `templates/magic_link.html` into _Magic Link_
   and `templates/confirmation.html` into _Confirm signup_ (both show the link and the code).
3. **Authentication → Emails → SMTP Settings**: before launch, a custom SMTP sender (the built-in
   one is rate-limited and meant for testing).
4. **Authentication → Sign In / Providers → Google**: enable, paste the Web client ID and secret
   from Google Cloud (below).
5. **Authentication → Sign In / Providers → Apple** (with the iOS release): enable, Client IDs
   `com.peakr.app`. The app uses the native iOS sheet, so no secret key is needed.
6. **Authentication → Sign In / Providers → Anonymous sign-ins**: enable (Phase 8a). The
   onboarding quiz signs in anonymously so it can connect Strava and import the baseline before
   the user has an account; `config.toml` only covers the local stack. Deploy the new function
   `strava-baseline` too (see Commands).
7. **Edge Functions → Secrets**: `TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET`,
   `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` (see `functions/.env.example`).
8. **Project Settings → API keys**: project URL and **publishable** key into
   `apps/mobile/.env.local` (see `apps/mobile/.env.example`) and into the EAS environment
   variables. Never the secret / service-role key.

### Google Cloud (Google sign-in)

1. <https://console.cloud.google.com> → new project "Peakr".
2. **Google Auth Platform → Branding**: app name, support email, links to home page, privacy
   policy and terms; authorised domains: your website domain and `supabase.co`.
3. **Audience**: External. While testing, add your Google accounts as test users.
4. **Data access**: scopes `openid`, `…/auth/userinfo.email`, `…/auth/userinfo.profile`.
5. **Clients → Create client → Web application**; authorised redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`. Copy client ID and secret into Supabase.

The app signs in with Google through Supabase in the browser, so no Android or iOS client (and
no SHA-1 fingerprint) is needed.

### Apple Developer (with the iOS release)

1. **Certificates, Identifiers & Profiles → Identifiers → `com.peakr.app`**: enable _Sign In with
   Apple_ (EAS Build also does this from `ios.usesAppleSignIn` in `app.json`).
2. Supabase Apple provider: Client IDs `com.peakr.app` (above).
3. Before emailing users who hide their address: **Services → Sign in with Apple for Email
   Communication**, register the sending domain/address.

### Strava (integration)

How an activity travels: Strava → `strava-webhook` (stores it in `activities`, sends a silent Expo
push) → the app gets it via Realtime (open) or the push (closed) → SQLite → `@peakr/engine`
merges sources, marks the planned session done or rebalances the week. `strava-sync` is the
"sync now" button and, at 03:30 UTC, the nightly catch-up for missed webhooks.

**Streams (terrain evaluation, route recognition):** for outdoor runs and rides the webhook import
also fetches the activity's streams (distance, altitude, time, heart rate, GPS) and stores them in
`activity_streams`, downsampled to ~25 m (`_shared/strava-streams.ts`). A failed stream request is
logged and never fails the activity import. "Sync now" fetches missing streams for up to 10 new
activities; the nightly catch-up and `POST /strava-sync/history` (summaries of the last 180 days,
for route recognition) fetch none, so they do not spend Strava's rate limit. The app requests
older streams in batches with `POST /strava-sync/streams` `{ "externalIds": [...] }` (max 10, only
the user's own stored outdoor runs/rides). All three user routes answer `429 rate_limited` and
`409 reconnect` like "sync now". Streams are tombstoned with their activity and on disconnect.

**Strava routes** (planned in Strava's route builder): `strava_routes` mirrors the athlete's ride
and run routes with the exported GPX. They are imported in the background after connecting, on
"sync now" (`routes: { imported, removed }` in the answer), nightly and with
`POST /strava-sync/routes` → `{ imported, removed }`: one list request per 50 routes, a GPX export
only for new or changed routes, routes no longer listed become tombstones. Private routes need the
`read_all` scope (requested since Phase 8); athletes who connected earlier see only public routes
until they reconnect. The app copies them into `routes` with `source = 'strava_route'`.

**1. Register the app** – <https://www.strava.com/settings/api> (needs a Strava subscription on
the account that owns the app):

| Field                          | Value                                                       |
| ------------------------------ | ----------------------------------------------------------- |
| Application Name               | `Peakr` (must not contain "Strava")                         |
| Category                       | Training                                                    |
| Club                           | empty                                                       |
| Website                        | `https://peakr.ch` (your website)                           |
| Application Description        | e.g. "Training plans that adapt to your Strava activities." |
| Authorization Callback Domain  | `<project-ref>.supabase.co` (domain only, no `https://`)    |

Upload the app icon, accept the API Agreement, then copy **Client ID** and **Client Secret** into
the Edge Function secrets `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`. New apps run in
single-player mode (only the owner's account can connect); raise the capacity in the API settings
and submit the app for Strava's review before launch. Strava's brand guidelines require the
official "Connect with Strava" button and the "Powered by Strava" logo – replace the plain button
in `connections-screen.tsx` with the official assets before submitting.

**2. Secrets** (dashboard → Edge Functions → Secrets, or `supabase secrets set …`):
`STRAVA_WEBHOOK_VERIFY_TOKEN` (any long random string), `CRON_SECRET` (another one), optional
`EXPO_ACCESS_TOKEN`. Deploy all three functions (commands above).

**3. Create the webhook subscription** (once per Strava app, after the functions are deployed –
Strava calls the callback right away and expects the answer within two seconds):

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions   -F client_id=<STRAVA_CLIENT_ID>   -F client_secret=<STRAVA_CLIENT_SECRET>   -F callback_url=https://<project-ref>.supabase.co/functions/v1/strava-webhook   -F verify_token=<STRAVA_WEBHOOK_VERIFY_TOKEN>
```

The answer is `{"id": 123456}`. Store it as the secret `STRAVA_SUBSCRIPTION_ID` (events with
another id are then rejected). Check or remove the subscription:

```bash
curl "https://www.strava.com/api/v3/push_subscriptions?client_id=<ID>&client_secret=<SECRET>"
curl -X DELETE "https://www.strava.com/api/v3/push_subscriptions/<subscription-id>?client_id=<ID>&client_secret=<SECRET>"
```

**4. Nightly catch-up** – the migration schedules the pg_cron job; it reads the project URL and the
cron secret from Vault. Run once in the SQL Editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<the same value as CRON_SECRET>', 'cron_secret');
```

Check runs with `select * from cron.job_run_details order by start_time desc limit 5;`.

**5. Push to the app** (wakes a closed app when an activity arrives): run `eas init` in
`apps/mobile` once (adds the EAS `projectId` to `app.json`), upload the FCM V1 service-account
key in EAS (`eas credentials` → Android → Push Notifications) and, for iOS, an APNs key. Without
it everything still works while the app is open (Realtime) and on the next start.

**Strava rules** (API Agreement): activities are used only to adapt that athlete's own plan,
are never shown to other users (RLS) and never used to train AI/ML models. Disconnecting, a
deauthorisation at Strava and account deletion delete the tokens and every imported activity.

## Account deletion

Profile → Account → Delete account (Google Play and the App Store require in-app deletion; the
website's `/delete-account` page is the required web route and describes the same steps). The
user types `DELETE`, the app calls `delete-account` with their JWT, and the function:

1. revokes Peakr's access at Strava (refreshing an expired token first; failures are logged
   without the token or the provider's response and do not block the deletion),
2. deletes the user's `activities`, `workouts`, `plans`, `routes`, `push_tokens`,
   `integration_tokens`, `integrations` and `profiles` rows explicitly (most also cascade),
3. deletes the auth user with the admin API.

It is idempotent: a second call finds nothing to delete, and the app treats "user no longer
exists" as success, so a lost answer can simply be retried. Afterwards the app wipes its SQLite
data (plan, activities, strength data, quiz progress, sync state), signs out locally and goes back
to onboarding. Offline, or when the function fails, nothing is deleted on the phone. Subscriptions
are not cancelled – the app and the website tell the user to cancel in Google Play / the App Store
or the Stripe portal. Email requests: delete the user in **Authentication → Users** after
revoking Strava (or call the function with that user's session).

## Reading the waitlist

The public key can only insert. Read or export sign-ups in the dashboard (**Table Editor →
waitlist**, or `select * from waitlist order by created_at` in the SQL Editor). To honour a
deletion request: `delete from waitlist where email = lower('person@example.com');`
