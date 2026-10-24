# Subscriptions: store and RevenueCat setup

What you create outside the repo so the paywall, the gates and the trial reminder work (Phase 10).
The Gym add-on has its own guide (`docs/gym-addon-setup.md`); both live in the same RevenueCat
project. Prices are the targets from CLAUDE.md "Monetisation" – the app always shows the store's
price, never a number from the code. Store consoles change their menus often: if a path below has
moved, look for the same setting by name.

## How it fits together

```
App (react-native-purchases) ──purchase──▶ Google Play / App Store
        │ app user id = Supabase user id               │
        ▼                                              ▼
   RevenueCat  ◀───── server notifications ────────────┘
        │  entitlements: training · plus · gym
        ├──▶ app: CustomerInfo → access full / readOnly / preview
        └──▶ webhook → Edge Function revenuecat-webhook → table entitlements
                                     └─ pg_cron hourly → trial-reminders → push + email
```

- **Product ids** (create exactly these; the app reads tier and period from them):

  | Tier                  | Google Play (subscription : base plans) | App Store (one group "Peakr")                  |
  | --------------------- | --------------------------------------- | ---------------------------------------------- |
  | Training              | `peakr_training` : `monthly`, `yearly`  | `peakr_training_monthly`, `peakr_training_yearly` |
  | Training + Nutrition  | `peakr_plus` : `monthly`, `yearly`      | `peakr_plus_monthly`, `peakr_plus_yearly`      |

- **Entitlements**: `training` (Training and Plus products), `plus` (Plus products only).
- Plus is shown as "coming soon" and cannot be bought in the app until the nutrition part ships
  (`PURCHASABLE_TIERS` in `apps/mobile/src/features/billing/model.ts`).
- Anonymous quiz users buy before they sign in. RevenueCat holds the purchase under an anonymous
  id; the sign-in calls `Purchases.logIn(<supabase user id>)` and RevenueCat moves it to the user.

## 1. Google Play Console

1. **Payments profile and merchant account** set up (Setup → Payments profile). Without it no
   subscription can be created.
2. Upload a signed build with billing to the **internal testing** track once
   (`eas build --profile production --platform android`, then upload or `eas submit`).
   `react-native-purchases` adds the `BILLING` permission. Products can only be created after an
   app bundle with that permission exists.
3. **Monetize with Play → Products → Subscriptions → Create subscription**
   - Product ID `peakr_training`, name "Peakr Training" (the id can never be changed or reused).
   - Base plan `monthly`: auto-renewing, billing period 1 month, price CHF 7.90 (Play converts the
     other countries; adjust them if you want round prices). Grace period and account hold: keep
     the defaults.
   - Base plan `yearly`: auto-renewing, 1 year, CHF 59.
   - **Offers** on each base plan → Add offer: offer id e.g. `trial-7d`, eligibility "New customer
     acquisition – Never had this subscription", one phase **Free trial, 7 days**. Google always
     collects the payment method upfront for a trial.
   - Activate both base plans and the offers.
4. Same for `peakr_plus` (CHF 11.90 / CHF 89). You may leave its base plans **inactive** until the
   nutrition part ships; the app does not sell it before then anyway.
5. **Plan changes**: nothing to configure. The app replaces the old subscription through the Play
   change flow: upgrades (monthly → yearly, Training → Plus) take effect at once with the
   remaining time credited, downgrades at the next renewal.
6. **Service account for RevenueCat** (RevenueCat reads purchases and validates receipts with it):
   - Google Cloud console (the project linked to the Play developer account): enable the
     **Google Play Android Developer API** and the **Google Play Developer Reporting API**.
   - IAM → Service accounts → create one (e.g. `revenuecat`), create a **JSON key**.
   - Play Console → **Users and permissions → Invite new user** with the service account's email,
     account permissions: *View app information*, *View financial data*, *Manage orders and
     subscriptions*. It can take up to 36 hours until Google accepts the credentials.
7. **Real-time developer notifications**: in RevenueCat (Play Store app settings) let it create the
   Pub/Sub topic, copy the topic name into Play Console → Monetize with Play → Monetization setup →
   *Google Play Billing → Topic name*, and send a test notification.
8. **License testing** (Setup → License testing): add your Google accounts and set "Licence
   response" to RESPOND_NORMALLY. Test subscriptions cost nothing and run fast: a 7-day trial
   lasts a few minutes, monthly renews every 5 minutes, at most 6 renewals.
9. Store listing → **Data safety**: declare "Purchase history" (collected, for app functionality).

## 2. App Store Connect (with the iOS release)

1. **Business → Agreements**: the Paid Apps agreement active, with tax and banking.
2. **Monetization → Subscriptions → Subscription Groups → Create**: group "Peakr". Both tiers in
   **this one group** – a user can have only one of them at a time, and Apple handles upgrades and
   downgrades inside the group. (The Gym add-on has its own group, see its guide.)
3. In the group create four auto-renewable subscriptions:

   | Reference name           | Product ID               | Duration | Price  | Level |
   | ------------------------ | ------------------------ | -------- | ------ | ----- |
   | Training + Nutrition Mo. | `peakr_plus_monthly`     | 1 month  | 11.90  | 1     |
   | Training + Nutrition Yr. | `peakr_plus_yearly`      | 1 year   | 89.00  | 1     |
   | Training Monthly         | `peakr_training_monthly` | 1 month  | 7.90   | 2     |
   | Training Yearly          | `peakr_training_yearly`  | 1 year   | 59.00  | 2     |

   Level 1 is the highest. Plus above Training makes Training → Plus an upgrade (immediate,
   prorated refund) and Plus → Training a downgrade (at the next renewal); monthly ↔ yearly at the
   same level is a crossgrade that Apple applies at the next renewal.
4. On every product: **Subscription Prices** (CHF base price, let Apple generate the others),
   **Introductory Offers → Free, 1 week, all countries, new subscribers**. Apple grants one
   introductory offer per subscription group and Apple ID – that is our "one trial per user".
5. Localisation (display name, description) and the **review information** (screenshot of the
   paywall, notes: "Subscriptions unlock the training plan; sign in with the demo account …").
   The first subscriptions are submitted **together with an app version**. Leave the Plus products
   "Ready to Submit" but do not submit them until the nutrition part ships.
6. **Keys for RevenueCat**: Users and Access → Integrations → **In-App Purchase** → generate a key
   (.p8), note the key id and the issuer id. Optional: an App Store Connect API key, so RevenueCat
   can import the products.
7. **App Store Server Notifications**: App Information → App Store Server Notifications → Version 2,
   production and sandbox URL = the URL RevenueCat shows in the App Store app settings.
8. **Sandbox testers**: Users and Access → Sandbox → Test accounts. On the device: Settings → App
   Store → Sandbox Account. A 1-week trial lasts 3 minutes in the sandbox.
9. Paywall requirements Apple checks in review: price and period, what is included, auto-renewal
   and how to cancel, a **Restore purchases** button, links to the **Terms** and the **Privacy
   policy**. The app shows the links once `EXPO_PUBLIC_SITE_URL` is set in the build.

## 3. RevenueCat

1. **Project** "Peakr" (the same project as the Gym add-on).
2. **Apps**:
   - *Play Store*: package `com.peakr.app`, upload the service-account JSON (1.6), set up the
     real-time developer notifications (1.7).
   - *App Store* (with the iOS release): bundle id `com.peakr.app`, In-App Purchase key + key id +
     issuer id (2.6), copy the server notification URL into App Store Connect (2.7).
3. **Products**: add/import the store products. Google Play products appear as
   `peakr_training:monthly`, `peakr_training:yearly`, `peakr_plus:monthly`, `peakr_plus:yearly`.
4. **Entitlements** (identifiers exactly):
   - `training` → all Training **and** all Plus products;
   - `plus` → the Plus products only;
   - `gym` → the Gym products (add-on guide). Never attach tier products to `gym`.
5. **Offerings**: `default`, marked as **current**:
   - package `$rc_monthly` → `peakr_training:monthly` / `peakr_training_monthly`;
   - package `$rc_annual` → `peakr_training:yearly` / `peakr_training_yearly`;
   - custom packages `plus_monthly` and `plus_annual` → the Plus products (shown as coming soon).
   The app takes packages, prices and trial length from this offering; package and product ids
   must contain "month" or "year"/"annual" so it can tell the periods apart.
6. **Project settings → General → Transfer behaviour**: *Transfer to new App User ID* (the default).
   It moves a purchase made in the quiz (anonymous) to the account the user signs in with.
7. **API keys**:
   - the public SDK keys (Android `goog_…`, iOS `appl_…`) into `apps/mobile/.env.local` and the EAS
     environment variables: `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY`;
   - a **secret API key (v1)** into the Supabase secret `REVENUECAT_SECRET_KEY`. The Edge Functions
     call `GET /v1/subscribers/{id}` (after each webhook event) and `DELETE /v1/subscribers/{id}`
     (account deletion). Never put it in the app or the website.
8. **Integrations → Webhooks → Add**:
   - URL `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`;
   - Authorization header: `Bearer <long random string>` – the exact same text goes into the
     Supabase secret `REVENUECAT_WEBHOOK_AUTH`;
   - environment: production and sandbox while testing (later production only); events: all.
   - "Send test event" must answer 200.
9. **Customer attributes**: nothing to set up. The app writes `peakr_price` and `peakr_product`
   before every purchase; the trial reminder reads the amount from them (RevenueCat events of a
   trial carry a price of 0).
10. **Stripe / Web Billing** (when the web checkout goes live): connect Stripe in RevenueCat,
    create the Stripe products with monthly and yearly prices and a 7-day trial with the card
    collected upfront, attach them to `training` (and `plus`), and send the Supabase user id as
    the app user id. The app then unlocks web purchases by itself; it never links to the web
    checkout (store rules).

## 4. Supabase

```bash
pnpm exec supabase db push                       # entitlements, trial_reminders, hourly cron job
pnpm exec supabase functions deploy revenuecat-webhook
pnpm exec supabase functions deploy trial-reminders
pnpm exec supabase functions deploy delete-account   # now also deletes the RevenueCat customer
pnpm exec supabase secrets set REVENUECAT_SECRET_KEY=… REVENUECAT_WEBHOOK_AUTH="Bearer …" SITE_URL=https://…
```

- The cron job uses the Vault secrets `project_url` and `cron_secret` that the nightly Strava
  catch-up already needs (`supabase/README.md`).
- **Email for the trial reminder**: the function sends through Resend when `RESEND_API_KEY` and
  `EMAIL_FROM` (e.g. `Peakr <hello@your-domain>`, a verified sender domain) are set; without them
  only the push goes out. Resend is the chosen provider (free tier 3,000 emails/month): create an
  account, verify the sending domain (DNS records), create an API key with "sending access".
  Another provider would fit behind `EmailProvider` in `supabase/functions/_shared/email.ts`.
  Resend can also be the custom SMTP sender for the sign-in emails (Supabase → Authentication →
  Emails → SMTP Settings: host `smtp.resend.com`, port 465, user `resend`, password = API key).

## 5. Test checklist

1. Development build without RevenueCat keys: the plan is fully usable (development grant); a
   release build without keys shows only the quiz, the forecast, week 1 and the paywall.
2. License tester (Play) / sandbox tester (iOS), fresh install → quiz → forecast → paywall shows
   "Free until <today + 7 days>, then CHF 59.00 / year" → start the trial → sign in → the plan is
   there, Profile → Subscription shows "Free trial" and the first charge date.
3. `select * from entitlements;` shows the `training` row with `period_type = trial`.
4. Trial reminder: with the accelerated test trial the charge is minutes away, so the next hourly
   run sends it. Run it at once with
   `curl -X POST https://<ref>.supabase.co/functions/v1/trial-reminders -H "x-cron-secret: <CRON_SECRET>"`
   – one push ("Your free trial ends tomorrow"), one email, one row in `trial_reminders`; a second
   call sends nothing.
5. Profile → Subscription → "Switch to yearly" goes through the store's change flow; "Cancel
   subscription" opens the store page of exactly this subscription. After the (accelerated)
   period ends, the plan is read-only: visible, but no edits, routes, integrations or exports.
6. "Restore purchases" on a second device with the same store account and Peakr account.
7. Account deletion removes the `entitlements` rows and the RevenueCat customer; the store
   subscription itself must be cancelled by the user (the deletion screen says so).
