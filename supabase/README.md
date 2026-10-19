# Supabase

Backend of Peakr: Auth (email magic link, Google, Sign in with Apple), Postgres with Row Level
Security, and Edge Functions for everything that needs a secret.

| Path                     | What                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `migrations/`            | SQL schema. Never edit a migration that was already pushed.            |
| `functions/oauth/`       | OAuth with third-party services (Strava first): start, callback, disconnect |
| `functions/_shared/`     | Token encryption, signed OAuth state, provider registry               |
| `templates/`             | Sign-in emails (link **and** 6-digit code)                            |
| `config.toml`            | Local CLI config; the hosted project is configured in the dashboard   |

## Data model

| Table                | Who writes                     | Notes                                                       |
| -------------------- | ------------------------------ | ----------------------------------------------------------- |
| `profiles`           | trigger on sign-up, the user   | one row per user                                            |
| `plans`              | the app (sync)                 | weeks + pauses as JSON; soft delete, deletion is final      |
| `workouts`           | the app (sync)                 | one row per planned workout; last write wins per workout    |
| `routes`             | the app                        | own route library, never visible to others                  |
| `integrations`       | Edge Functions only            | metadata of connected services; the user can read own rows  |
| `integration_tokens` | Edge Functions only            | AES-GCM encrypted tokens; no access for app or website      |
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
6. **Edge Functions → Secrets**: `TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET`,
   `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` (see `functions/.env.example`).
7. **Project Settings → API keys**: project URL and **publishable** key into
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

<https://www.strava.com/settings/api>: create the app; _Authorization Callback Domain_ =
`<project-ref>.supabase.co`. Client ID and secret go into the Edge Function secrets.

## Reading the waitlist

The public key can only insert. Read or export sign-ups in the dashboard (**Table Editor →
waitlist**, or `select * from waitlist order by created_at` in the SQL Editor). To honour a
deletion request: `delete from waitlist where email = lower('person@example.com');`
