# Phase 10 – Subscriptions & paywall (app)

Prompt: in-app subscriptions with RevenueCat, Supabase user id as app user id; tiers Training /
Training + Nutrition (coming soon), monthly + yearly, 7-day trial upfront; paywall after the
forecast with first charge date; gates for `training`; no free tier; webhook → Edge Function;
Profile → Subscription with change flow and cancel deep links; trial-ending reminder (push +
email); no link to the web checkout. Explain the RevenueCat / Play Console / App Store Connect setup.

Already there (phase 8e, Gym add-on): `features/billing` (RevenueCat client, entitlements model,
store, subscription screen), `docs/gym-addon-setup.md`.

## Decisions

- **Access levels** (`model.ts`, pure): `full` (training active, incl. trial), `readOnly` (had
  `training` before – RevenueCat `entitlements.all` – but it lapsed: plan visible, nothing
  editable), `preview` (never subscribed: week 1 only + paywall), `pending` (billing loading).
  Development builds without a RevenueCat key (or before it loads) get `full`, so dev and the
  existing tests keep working; release builds never do. Last known level cached in `app_settings`
  for offline starts when the SDK fails.
- **Anonymous quiz users** buy with RevenueCat's anonymous id; sign-in calls `Purchases.logIn`
  (already in `configureBilling`), which moves the purchase onto the Supabase user. RevenueCat
  project setting "Transfer behaviour" must be "Transfer to new App User ID".
- **Price for the reminder**: before a purchase the app sets subscriber attributes
  (`peakr_price`, `peakr_product`), the webhook reads them back from the RevenueCat REST API.
- **Webhook = refresh**: every RevenueCat event only names users; the Edge Function fetches the
  subscriber from the RevenueCat REST API (secret key) and replaces that user's rows in
  `subscriptions`. Robust against out-of-order and transfer events.
- **Trial reminder**: pg_cron hourly → `trial-reminders` Edge Function: trials that convert in
  the next 24 h, still renewing, not yet reminded → one push (always visible) + one email.
  Email via an `EmailProvider` interface; Resend as the first implementation, only active with
  `RESEND_API_KEY` (new service → user decides; nothing is sent without the key).
- **Gates**: route files of edit/regenerate/pause/routes/integrations/watch/exports screens wrap
  in `withTraining()`; Plan tab shows week 1 only in `preview`; Today and Insights show the
  locked card in `preview`; workout detail hides actions unless `full`.
- **Change flow**: Android `googleProductChangeInfo` (replace old product), iOS same subscription
  group (store handles it). Plus is not purchasable until Part B.

## Steps

1. [x] Model: tier packages, access levels, trial text helpers, tests
2. [x] Client + store: tier offering, trial eligibility, attributes, change flow, access cache
3. [x] Paywall screen (real), purchase → plan → sign-in, tests
4. [ ] Gates across the app, tests
5. [ ] Subscription screen: change period/tier, restore, trial status, tests
6. [ ] Server: migration, `@peakr/billing` pure code + vitest, `revenuecat-webhook`,
       `trial-reminders` (pg_cron), push always-visible, delete-account cleanup
7. [ ] Docs: `docs/subscriptions-setup.md`, supabase/README, queue
