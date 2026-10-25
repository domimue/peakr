# Personal build – Peakr for your own use, before billing exists

A standalone Android APK that you install directly on your phone (no Play Store, no developer
account) with **everything unlocked**: training plan, calendar, workouts, integrations and the
Gym add-on, without RevenueCat, Stripe or a store subscription.

**Only for yourself.** Do not share the APK: it is Peakr without the subscription that CLAUDE.md
requires ("no free tier"). Store builds (`production`) can never carry the unlock – `app.config.ts`
refuses it for the `production` profile even if the variable leaks into that build.

## How it works

- EAS profile `personal` in `apps/mobile/eas.json`: internal distribution, APK, env
  `PEAKR_PERSONAL_BUILD=1`, EAS environment `preview`.
- `app.config.ts` turns that into `extra.personalBuild`; `src/config/build.ts` reads it.
- `useAccess()` returns `full` and `useHasGym()` returns `true`; the paywall after the forecast
  says "everything is unlocked" and continues to the plan; the sign-in can be skipped
  ("Continue without an account").
- Same package name (`com.peakr.app`) as the store app, so the app links work with it too.

## Build and install

1. Expo account (free) at <https://expo.dev> and, once, in `apps/mobile`:
   `npx eas-cli@latest login` (and `npx eas-cli@latest init` if the project is not linked yet).
2. Build:
   ```sh
   cd apps/mobile
   npx eas-cli@latest build -p android --profile personal
   ```
   The first build asks to create an Android keystore – answer **yes** (EAS keeps it).
   The build runs in the cloud (~15–25 min).
3. When it is done, the terminal and expo.dev show a **link and a QR code**. Open it on the
   phone, download the APK and install it. Android asks once to allow installs from the browser
   ("Install unknown apps") – allow it for that browser.
4. Updates: build again and install over the old one; your data stays.

## Optional: account, sync and maps

Without these variables the app works fully **offline on the phone**: quiz, plan, calendar,
workouts, gym. Sign-in, sync, Strava and the website account need the Supabase keys; route maps
need MapTiler.

Add them on expo.dev → project → **Environment variables**, environment **preview**, visibility
"Plain text" (they are public keys), then build again:

| Name | Value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API keys (publishable) |
| `EXPO_PUBLIC_SITE_URL` | `https://peakr-web.vercel.app` |
| `EXPO_PUBLIC_MAPTILER_KEY` | optional, route maps |

Never add a secret / service-role key here.

## Server features in the personal build

The unlock is in the app only. Edge Functions that check the subscription on the server
(generated round trips, the daily workout reminder) need a sign-in and an entitlement row for your
user – see "Personal build" in `docs/generated-routes.md` (one SQL insert). Developer-only flags
(`personalBuildFlags` in `src/config/feature-flags.ts`, currently the Garmin personal key) are on
in this build; the server side still needs its secret (`GARMIN_PERSONAL_KEY=1`,
`docs/health-garmin.md`).

## Optional: "Open Peakr" opens this app

The website's app links verify against the signing certificate. For the personal APK only the
EAS keystore matters:

1. `npx eas-cli@latest credentials` → Android → `com.peakr.app` → the keystore shows
   **SHA256 Fingerprint**.
2. Vercel → `ANDROID_CERT_SHA256` = that value → Redeploy.
3. On the phone: `peakr-web.vercel.app/get-app` → "Open Peakr" opens the app. Details and
   troubleshooting: `docs/app-links.md`.

## Later, for the store

Nothing to undo: the store uses the `production` profile, which has no unlock. Set up billing
(`docs/subscriptions-setup.md`) before the first store release. When the Play signing key exists,
add its fingerprint to `ANDROID_CERT_SHA256` as well.
