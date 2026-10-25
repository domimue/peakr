# App links, deep links & "Get the app" (Phase 10d)

One button on the website opens the Peakr app if it is installed and the store if it is not.
This is done with **Android App Links** and **iOS Universal Links** on our own domain – no
scheme-sniffing with timers, no deferred-deep-link SDK. No browser can tell whether an app is
installed, so the site never tries to find out: the operating system either opens the app or
the browser loads the fallback page.

## How it fits together

```
"Open Peakr" (header, account, checkout success, Get the app, confirmation email)
   │  https://peakr-open.vercel.app/open[/<target>]?from=<placement>
   ▼
Phone with Peakr installed ──► Android / iOS opens the app ──► app route /open/... ─┐
Phone without Peakr ─────────► browser loads /open (website) ──► store badge,        │
                               goes to the store after ~2.5 s (once per session)     │
Computer ────────────────────► the button goes to /get-app instead (QR + badges)     │
                                                                                     ▼
                         signed in? open the target : remember it → sign-in → open it
```

- **Link format**: `https://<host>/open` (Today) and `/open/today`, `/open/plan`,
  `/open/workout/<id>`, `/open/gym`, `/open/insights`, `/open/profile`, `/open/account`,
  `/open/subscription`. Also `peakr://open/...`. Anything else opens Today
  (`apps/mobile/src/features/deep-links/targets.ts`). Only `/open/*` paths are claimed by the app,
  so every other page of the website stays in the browser.
- **Why a separate link host** (`peakr-open.vercel.app`): iOS never hands a tap to the app when the
  link goes to the same site the visitor is already on, and Chrome behaves the same way for
  same-site navigation. The website's buttons therefore point to the link host. Links from email or other
  apps work on the main domain too; both hosts are claimed by the app.
- **App side**: cold and warm start both land on the `open` route, which waits for the stored
  session. Without an account it remembers the target (24 h, in SQLite-backed storage, so it
  survives fetching the magic link from the mail app) and opens the sign-in; after sign-in the
  target opens instead of Today. Logging in with the checkout account is what restores the plan.
- **Install attribution**: the Play Store link carries
  `referrer=utm_source=website|email&utm_medium=<placement>&utm_campaign=get_the_app`. The app
  reads it once with the Play Install Referrer API (`expo-application`) and keeps it on the device
  for Phase 11b. It never carries state.
- **Confirmation email**: after a website checkout the site sends one email (Resend) with the
  same "Open Peakr" link plus the "create your account" link (`confirmation-email.ts`, column
  `web_checkouts.confirmed_at`).
- **Store rules**: everything here lives on the website. The app never links to the web checkout.

## Setup – what you need to do

### 1. Domains (Vercel)

The app claims two hosts (`apps/mobile/app.config.ts`):

- `peakr-web.vercel.app` – the website
- `peakr-open.vercel.app` – the link host the "Open Peakr" buttons point to (Vercel → project →
  Domains → Add Existing, assigned to Production, no redirect). Both are already set up.

`vercel.app` is on the Public Suffix List, so these two count as different sites – exactly what
iOS and Chrome need to hand a tap from the website to the app.

Env vars on Vercel (Production), then redeploy:

- `NEXT_PUBLIC_APP_LINK_URL=https://peakr-open.vercel.app`
- `NEXT_PUBLIC_SITE_URL=https://peakr-web.vercel.app` – set it explicitly, so canonical links,
  emails and Stripe return URLs never pick the link host.

**Moving to an own domain later** (e.g. `example.ch` + `open.example.ch`): add both in Vercel,
change `DEFAULT_HOSTS` in `app.config.ts` (or set `APP_LINK_HOSTS`), change
`NEXT_PUBLIC_APP_LINK_URL` and `NEXT_PUBLIC_SITE_URL`, and ship a new app build – installed apps
only open links on the hosts they were built with. The apex must not redirect to `www` (Apple's
CDN and Android verification do not follow redirects).

The verification files are generated at build time – **redeploy after changing any of the
variables below**.

### 2. Android: `/.well-known/assetlinks.json`

Set on Vercel:

| Variable | Value |
| --- | --- |
| `ANDROID_PACKAGE_NAME` | `com.peakr.app` (default) |
| `ANDROID_CERT_SHA256` | the SHA-256 fingerprints, comma-separated, format `AA:BB:…` (32 pairs) |

**You need two fingerprints – both, always:**

1. **Upload key** (signs the builds EAS makes and that you install directly, e.g. internal APKs):
   `cd apps/mobile && npx eas-cli@latest credentials` → Android → `production` → the keystore
   section shows **SHA256 Fingerprint**. Also visible on expo.dev → project → Credentials →
   Android → `com.peakr.app`.
2. **Google Play App Signing key** (Google re-signs every install from the store with it):
   Play Console → Peakr → **Test and release → App integrity → App signing** → "App signing key
   certificate" → **SHA-256 certificate fingerprint**. The same page also lists the upload key,
   so you can cross-check (1).

Without the Play signing key verification fails for **everyone who installs from the store**;
without the upload key it fails for your own EAS test builds. The file is only served (404 until
then) once at least one valid fingerprint is set.

Shortcut: Play Console → **Grow users → Deep links** (after the first upload) shows a ready
`assetlinks.json` and checks the live one.

### 3. iOS: `/.well-known/apple-app-site-association` (prepared now, used with the iOS release)

| Variable | Value |
| --- | --- |
| `APPLE_TEAM_ID` | 10 characters, developer.apple.com → Account → Membership details |
| `IOS_BUNDLE_ID` | `com.peakr.app` (default) |

Served as `application/json`, no file extension, no redirect, status 200 (404 until the Team ID
is set). The app's associated-domains entitlement (`applinks:peakr-web.vercel.app`, `applinks:peakr-open.vercel.app`)
is in `apps/mobile/app.config.ts`; EAS enables the capability for the App ID on the next build.

**App hosts** in the app: `apps/mobile/app.config.ts` claims `peakr-web.vercel.app` and
`peakr-open.vercel.app`. A different domain → change `DEFAULT_HOSTS` there (or set
`APP_LINK_HOSTS=example.com,open.example.com` in the EAS build environment) and build again.
Changing hosts always needs a new build.

### 4. Store links, badges and Smart App Banner

| Variable | When |
| --- | --- |
| `NEXT_PUBLIC_PLAY_STORE_URL` | `https://play.google.com/store/apps/details?id=com.peakr.app`, once published (the referrer is appended automatically) |
| `NEXT_PUBLIC_APP_STORE_URL` | with the iOS release; until then the App Store button reads "coming soon" and is disabled |
| `NEXT_PUBLIC_APP_STORE_ID` | the numeric id from the App Store URL – turns on the iOS Smart App Banner |

**Badges** – use the official artwork unchanged (no recolouring, no redrawing, no stretching):

- Google Play: <https://play.google.com/intl/en_us/badges/> → download the PNG and save it as
  `apps/web/public/badges/google-play.png`. The PNG includes its own clear space; the page shows
  it at 72 px height (≈ 48 px visible badge).
- App Store: <https://developer.apple.com/app-store/marketing/guidelines/> → "Download on the App
  Store" badge, black SVG, saved as `apps/web/public/badges/app-store.svg`. The page shows it at
  48 px height with a quarter of its height as clear space on every side.

Until the files exist, plain buttons with the same text are shown. A store without a link never
shows a badge (a disabled "coming soon" button instead – a greyed-out badge would alter it).

### 5. Email

`RESEND_API_KEY` and `EMAIL_FROM` on Vercel (same values as the Supabase function secrets) for
the checkout confirmation email. Apply the migration `20261101000000_checkout_confirmation.sql`
(`pnpm exec supabase db push`).

### 6. App build

`expo-application` was added (Play Install Referrer). Make a new development/production build
(`eas build`), the intent filters and entitlements are native configuration.

## Testing

### Android App Links

1. Install a build signed with a key whose fingerprint is in `assetlinks.json` (an EAS build →
   upload key; a Play internal-testing install → Play signing key).
2. Check the hosted file:
   `curl -i https://peakr-open.vercel.app/.well-known/assetlinks.json` → `200`, `content-type:
   application/json`, no `location` header. Same for `https://peakr-web.vercel.app/...`.
   Google's checker: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://peakr-open.vercel.app&relation=delegate_permission/common.handle_all_urls`
3. Verification state on the device:
   ```sh
   adb shell pm verify-app-links --re-verify com.peakr.app
   adb shell pm get-app-links com.peakr.app
   ```
   Both domains must show `verified`. (`legacy_failure` / `1024` = the file could not be read or a
   fingerprint is missing.)
4. Open links:
   ```sh
   adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE \
     -d "https://peakr-open.vercel.app/open/plan"
   adb shell am start -a android.intent.action.VIEW -d "peakr://open/subscription"
   ```
   Cold start: `adb shell am force-stop com.peakr.app` first. Warm start: with the app open.
   Signed out: the sign-in opens, and after logging in the plan (or subscription) opens.
5. Real flow: on the phone open `https://peakr-web.vercel.app/get-app` in Chrome → "Open Peakr" opens the
   app. Uninstall → same button → fallback page → Play Store after ~2.5 s.
6. Play Console → **Grow users → Deep links** shows per domain whether verification works for the
   store-signed app.

### iOS Universal Links (with the iOS release; needs a real device)

1. `curl -i https://peakr-open.vercel.app/.well-known/apple-app-site-association` → `200`, JSON, no
   redirect. Apple's CDN copy: `https://app-site-association.cdn-apple.com/a/v1/peakr-open.vercel.app`
   (can lag a few hours behind).
2. Install the build on an iPhone. Paste `https://peakr-open.vercel.app/open/plan` into Notes or
   Messages and tap it → Peakr opens. (Typing the URL into Safari's address bar never opens an
   app – that is iOS behaviour, not a bug.)
3. On the website (`peakr-web.vercel.app/get-app`) tap "Open Peakr" → the app opens (link goes to the
   link host, so it is cross-site).
4. Developer mode: Settings → Developer → **Associated Domains Development** lets you test
   against your server directly; for that add `?mode=developer` to the entitlement temporarily.
5. Smart App Banner: with `NEXT_PUBLIC_APP_STORE_ID` set, Safari shows the banner on every page.

### If verification fails

- **Redirect**: the `.well-known` URL must answer 200 itself – check apex vs. `www`, HTTP→HTTPS
  is fine only if the HTTPS URL answers directly.
- **Fingerprint missing**: store installs need the **Play signing key**, EAS builds the **upload
  key**. Compare with `adb shell pm get-app-links` and Play Console → App integrity.
- **Wrong package / Team ID / bundle id**: compare the JSON with `com.peakr.app` and the Team ID.
- **Not redeployed**: the files are built at deploy time – redeploy after changing variables.
- **Host not claimed by the build**: `npx expo config --type introspect` in `apps/mobile` shows the
  intent filter hosts and `associated-domains`; a new host needs a new build.
- **Android re-verification** only happens on install/update or with `pm verify-app-links
  --re-verify`; **iOS** fetches through Apple's CDN on install and caches it.
- **Same-site taps**: a link to `peakr-web.vercel.app` tapped on `peakr-web.vercel.app` stays in the browser on iOS (and
  usually Chrome). That is why the buttons point to `peakr-open.vercel.app`.
- **In-app browsers** (Instagram, some mail apps) may not hand links to apps. The fallback page
  then shows the store and "Already installed? Open Peakr", which links to the other host.
