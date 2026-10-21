# Gym add-on: store setup and Strava testing

What you have to create outside the repo for the `gym` add-on, and how to test the Strava upload
without filling your own feed. The prices below are the targets from CLAUDE.md "Monetisation"; the
app reads the real prices from the stores through RevenueCat and never hard-codes them.

## 1. Google Play Console

1. **Monetize → Products → Subscriptions → Create subscription.**
   - Product ID: `peakr_gym` (cannot be changed later). Name: "Peakr Gym".
2. Add two **base plans** (auto-renewing):
   - `monthly` – billing period 1 month, price ~3.90 CHF (set other regions/currencies as needed).
   - `yearly` – billing period 1 year, price ~29 CHF.
3. On **each base plan → Add offer**: type "New customer acquisition", eligibility "new
   subscribers", phase **Free trial, 7 days**. Payment details are always collected upfront by
   Google Play for trials.
4. Activate the subscription and both base plans.
5. The tiers (`training`, `plus`) stay separate subscriptions; do **not** put the add-on into their
   subscription. Google Play allows several active subscriptions per user.
6. **Test**: Setup → License testing: add your Google account(s); test purchases renew quickly and
   are not charged. Upload at least one build to an internal testing track first (billing needs a
   signed build with the BILLING permission, which `react-native-purchases` adds).

RevenueCat sees this product as `peakr_gym:monthly` / `peakr_gym:yearly`.

## 2. App Store Connect

1. **Monetization → Subscriptions → Create Subscription Group**: "Peakr Gym". It must be **its own
   group**, not the group of the tiers – one group allows only one active subscription, and the
   add-on has to run next to a tier.
2. Add two subscriptions in that group:
   - Reference name "Peakr Gym Monthly", Product ID `peakr_gym_monthly`, duration 1 month, ~3.90 CHF.
   - Reference name "Peakr Gym Yearly", Product ID `peakr_gym_yearly`, duration 1 year, ~29 CHF.
   Give the yearly one the higher **level** only if you want upgrades/downgrades inside the group
   (monthly ↔ yearly); both are the same service level, so use the same level and let the user
   switch the period.
3. On each: **Subscription Prices**, then **Introductory Offers → Free, 7 days, new subscribers**.
4. Fill in localisation (display name, description) and the review screenshot/notes. The first
   subscriptions must be submitted together with an app version.
5. **Sandbox testers**: Users and Access → Sandbox → add testers.

## 3. RevenueCat

1. **Products**: add the four store products (`peakr_gym:monthly`, `peakr_gym:yearly` for Play –
   RevenueCat lists base plans as `<id>:<base plan>` – and `peakr_gym_monthly`,
   `peakr_gym_yearly` for the App Store). If Stripe (Web Billing) is connected, add the matching
   web products with "monthly" / "yearly" in their identifiers.
2. **Entitlements → New**: identifier exactly **`gym`**. Attach the four (or six) gym products.
   Do not attach them to `training` or `plus`, and do not attach tier products to `gym`.
3. **Offerings → New**: identifier exactly **`gym`** (the tiers stay in `default`). Add packages
   "monthly" (`$rc_monthly`) and "yearly" (`$rc_annual`) pointing at the gym products. The app
   shows the packages of the `gym` offering and takes prices and trial length from the store.
4. **API keys**: copy the public SDK keys (Android, iOS) into `apps/mobile/.env`:
   `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (see `.env.example`), and
   into the EAS build secrets. The app identifies users by their Supabase user id, the same id the
   web checkout uses.
5. **Stripe / web** (when the web checkout goes live): create a Stripe product "Peakr Gym" with
   monthly and yearly prices and a 7-day trial with the card collected upfront, import it into
   RevenueCat and attach it to `gym`.

The app only reads the entitlement `gym`; without a RevenueCat key the Gym tab shows the preview
and the paywall (development builds have an "Unlock without purchase" button).

## 4. Strava

- The Strava API app needs no new settings. Existing users have only read scope: the first time
  they post, the app asks for the upgrade (`activity:write`), and declining leaves the existing
  connection untouched. New connections request `activity:write` right away.
- **Structured upload availability**: Strava documents the JSON/FIT-`set` format for weight
  training (changelog 21 May 2026). If Strava refuses it for the Peakr app, the app says
  "Structured upload not available" and offers a plain weight-training activity with a text
  summary *only after the user taps it* – it is never posted silently. If that happens, contact
  Strava developer support with the rejected response (`supabase functions logs strava-upload`).
- Webhook: no change. Uploaded activities are recognised by their `external_id` prefix
  `peakr-gym-` (and the stored activity id) and ignored, so a posted session never comes back as a
  second activity.

## 5. Testing the Strava upload without spamming your feed

1. **Dry run (no Strava call at all).** Set the secret `STRAVA_UPLOAD_DRY_RUN=1`
   (`pnpm exec supabase secrets set STRAVA_UPLOAD_DRY_RUN=1`), post a session from the app and read
   the exact payload with `pnpm exec supabase functions logs strava-upload`. Remove the secret when
   done. The payload builder is also covered by unit tests
   (`packages/engine/src/gym/strava-upload.test.ts`).
2. **Real upload to a throw-away account.** Create a second Strava account, connect *that* one to
   Peakr in a development build, and post there. Your own feed stays untouched. (While the Strava
   API app is in "single athlete" mode, add the test athlete under My API Application → Players,
   or swap the connected athlete.)
3. **Real upload on your own account, hidden.** In Strava → Settings → Privacy Controls set the
   default activity visibility to **Only You**, post, check the result and delete the test
   activities on Strava afterwards. Followers never see them.
4. Check three things: the activity shows the sets and the muscle map; posting the same session
   twice creates no second activity; and the session does **not** show up as an imported activity
   in Peakr afterwards (it would count the load twice).

## 6. Health Connect

- Android only for now. The permission dialog asks for two write permissions: exercise sessions
  and active calories. Nothing is read.
- Health Connect needs a privacy policy link and the permission rationale activity on Android 14+;
  the Play Console "Health apps declaration" has to list "Exercise" and "Active calories burned".
- A dev build is required (`eas build --profile development --platform android`); the plugin
  `react-native-health-connect` and `minSdkVersion 26` are set in `app.json`.
- HealthKit is prepared behind the same interface (`apps/mobile/src/features/health/health.ios.ts`)
  and activates with the iOS release.
