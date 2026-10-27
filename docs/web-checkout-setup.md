# Website funnel: Stripe, RevenueCat and Supabase setup

What you set up outside the repo so the website funnel works (Phase 10b): quiz → forecast →
paywall → Stripe Checkout (7-day trial, card upfront) → account → "Get the app". The app side and
the store products are in [`subscriptions-setup.md`](subscriptions-setup.md); both live in the same
RevenueCat project and the same Supabase project. Dashboards move their menus around: if a path
below has changed, look for the same setting by name.

## How it fits together

```
Browser ── quiz (anonymous Supabase user) ── quiz_sessions
   │
   ├─ paywall → POST startCheckout → Stripe Checkout (hosted) ── web_checkouts (open)
   │                                     │ checkout.session.completed
   │                                     ▼
   │                      /api/stripe/webhook  (and the success page, whichever is first)
   │                         ├─ web_checkouts → complete (email, customer, subscription, trial end)
   │                         └─ RevenueCat POST /v1/receipts (app_user_id = quiz user) ──┐
   │                                                                                     ▼
   ├─ /checkout/success → sign in (magic link / Google / Apple)          RevenueCat: entitlement training
   │       └─ /checkout/claim → account takes over answers + checkout,          │ webhook
   │             RevenueCat transfer, plan written to plans/workouts             ▼
   │                                                         revenuecat-webhook → entitlements
   └─ /get-app → install, log in → the app syncs the plan, RevenueCat unlocks it
```

- **One account, one id**: the Supabase user id is the RevenueCat app user id on both surfaces.
  The quiz runs under an anonymous Supabase user; the purchase is first registered for that id
  and moved to the account when it signs in (RevenueCat "transfer").
- **Renewals, cancellations, plan changes** in the Stripe customer portal reach RevenueCat through
  RevenueCat's own Stripe integration – the website does not handle them.
- **Trial reminder**: the existing `trial-reminders` function covers web trials too (store
  `stripe`, cancel link → `/account`). Buyers who never created their account get it at their
  checkout email.

## 1. Stripe

Do everything first in **test mode** (toggle top right), then repeat it in live mode – test and
live have separate products, prices, webhooks and keys.

1. **Business details** (Settings → Business): public business name "Peakr", support email,
   statement descriptor (e.g. `PEAKR`). **Settings → Public details → Terms of service URL** =
   `https://<your-domain>/terms` – required, because checkout asks the buyer to accept the terms
   (`consent_collection`); without it Stripe refuses to create the checkout.
2. **Product catalogue → Add product** "Peakr Training":
   - price 1: recurring, monthly, **CHF 7.90**;
   - price 2: recurring, yearly, **CHF 59.00**.
   Do **not** add a trial to the price – the website adds the 7 days per checkout, so a second
   purchase by the same person gets none. Copy both price ids (`price_…`).
   "Peakr Training + Nutrition" (CHF 11.90 / 89.00) can be created now or later; it is shown as
   "coming soon" and not sold until the nutrition part ships.
3. **Tax** (optional, decide with your accountant): Swiss VAT applies once turnover passes the
   threshold. With Stripe Tax, enable it and set the products' tax code to "Software as a
   service"; the checkout code then needs `automatic_tax: { enabled: true }` (not set yet).
4. **Customer portal** (Settings → Billing → Customer portal):
   - allow: update payment method, view invoices, **cancel subscriptions** ("at end of billing
     period", so access stays until the paid period ends), **switch plans** between the monthly and
     yearly Training prices (proration: "prorate" for upgrades);
   - business info: terms and privacy links (`/terms`, `/privacy`);
   - default return URL: `https://<your-domain>/account`.
   The account page opens the portal for the signed-in user's Stripe customer.
5. **Emails** (Settings → Billing → Subscriptions and emails): turn on "Send emails about
   upcoming renewals" if you like, and successful payment receipts. Stripe's own "trial ending"
   reminder is sent 7 days before the end – useless for a 7-day trial; Peakr sends its own one day
   before (push + email).
6. **Webhook** (Developers → Webhooks → Add endpoint):
   - URL `https://<your-domain>/api/stripe/webhook`;
   - events: `checkout.session.completed`, `checkout.session.expired`;
   - copy the **signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
7. **API keys** (Developers → API keys): the **secret key** (`sk_test_…` / `sk_live_…`) →
   `STRIPE_SECRET_KEY` (Vercel) and the Supabase secret of the same name (account deletion cancels
   website subscriptions). A restricted key works too, with write access to Checkout Sessions,
   Customers, Subscriptions and Customer portal, read access to Prices and Products.

## 2. RevenueCat

In the same project as the app (`subscriptions-setup.md` § 3):

1. **Apps → + New → Stripe**: connect your Stripe account (test mode first). RevenueCat installs
   its Stripe app and then sees subscriptions, renewals and cancellations itself.
2. In the Stripe app settings in RevenueCat copy the **public API key** (`strp_…`) →
   `REVENUECAT_STRIPE_PUBLIC_KEY` (Vercel). The website sends each new Stripe subscription with
   it (`POST /v1/receipts`, `X-Platform: stripe`).
   If the settings offer "track new purchases from Stripe Checkout" with an app user id field in
   the metadata: switch it on with the field `app_user_id` – the checkout sets it on the session
   and the subscription. It is a second path; the website's own call already covers it.
3. **Products**: import the Stripe product(s). Attach "Peakr Training" to the entitlement
   **`training`** (and later "Training + Nutrition" to `training` **and** `plus`). No offering is
   needed for the web – the website reads the prices from Stripe.
4. **Project settings → Transfer behaviour**: *Transfer to new App User ID* (already set for the
   app). That is what moves the purchase from the anonymous quiz user to the account.
5. **Webhook** (`revenuecat-webhook`, from Phase 10): make sure sandbox events are sent while you
   test. Stripe test mode purchases are sandbox purchases in RevenueCat.
6. The **secret key (v1)** you already created (`REVENUECAT_SECRET_KEY`) is also needed by the
   website (Vercel): it writes the price attribute that the trial reminder names.

## 3. Supabase

```bash
pnpm exec supabase db push                          # quiz_sessions, web_checkouts, cron jobs
pnpm exec supabase functions deploy checkout-reminders
pnpm exec supabase functions deploy trial-reminders  # email for buyers without an account
pnpm exec supabase functions deploy delete-account   # cancels website subscriptions
pnpm exec supabase secrets set STRIPE_SECRET_KEY=sk_… SITE_URL=https://<your-domain>
```

- **Authentication → Sign In / Providers**: *Allow anonymous sign-ins* stays on (the app needs
  it too). Recommended before launch: **Attack protection → CAPTCHA** (Cloudflare Turnstile) –
  anonymous sign-ins are rate-limited per IP but otherwise open. (The website does not send a
  captcha token yet; switching CAPTCHA on needs that small addition first.)
- **Authentication → URL Configuration**: Site URL `https://<your-domain>`; add the redirect URL
  `https://<your-domain>/auth/callback` (and `https://*-<team>.vercel.app/auth/callback` for
  preview deployments, `http://localhost:3000/auth/callback` for local tests). The app's
  `peakr://**` stays.
- **Google / Apple providers**: the same providers as the app. For the website, Google needs no
  change (Supabase's callback URL is already registered). For Sign in with Apple on the web add a
  **Services ID** in the Apple developer account with the return URL
  `https://<project-ref>.supabase.co/auth/v1/callback`, and enter it with its secret key in the
  Apple provider (the app's native Apple sign-in keeps working).
- **Email templates**: `supabase/templates/*.html` now say the code also works on the website.
  Upload them again (Authentication → Emails) if you edited them in the dashboard. Sending through
  Resend's SMTP is recommended (`subscriptions-setup.md` § 4).
- **Secrets** for the reminders: `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL`, `CRON_SECRET`
  (already there from Phase 10). Without the email provider nothing is sent.

## 4. Vercel (website environment variables)

| Name                              | Value                                                 | Notes |
| --------------------------------- | ----------------------------------------------------- | ----- |
| `SUPABASE_URL`                    | `https://<project-ref>.supabase.co`                   | already there |
| `SUPABASE_PUBLISHABLE_KEY`        | `sb_publishable_…`                                    | already there |
| `SUPABASE_SECRET_KEY`             | `sb_secret_…` (or the legacy service role key)        | server only; claims checkouts, writes the plan |
| `FUNNEL_COOKIE_SECRET`            | `openssl rand -base64 32`                             | signs the funnel cookie |
| `STRIPE_SECRET_KEY`               | `sk_test_…` (Preview) / `sk_live_…` (Production)      | |
| `STRIPE_WEBHOOK_SECRET`           | `whsec_…` of the endpoint of that environment         | |
| `STRIPE_PRICE_TRAINING_MONTHLY`   | `price_…`                                             | |
| `STRIPE_PRICE_TRAINING_YEARLY`    | `price_…`                                             | |
| `STRIPE_PRICE_PLUS_MONTHLY` / `_YEARLY` | `price_…`                                       | later (Plus is "coming soon") |
| `REVENUECAT_STRIPE_PUBLIC_KEY`    | `strp_…`                                              | |
| `REVENUECAT_SECRET_KEY`           | `sk_…` (RevenueCat v1 secret)                         | server only |
| `NEXT_PUBLIC_SITE_URL`            | `https://<your-domain>`                               | already there; used in Stripe return URLs and email links |
| `NEXT_PUBLIC_PLAY_STORE_URL`      | `https://play.google.com/store/apps/details?id=com.peakr.app` | only once the app is published; until then "Get the app" says it is coming |
| `NEXT_PUBLIC_APP_STORE_URL`       | the App Store link                                    | with the iOS release |

Use **test-mode** Stripe values for Preview deployments and live values for Production only.

**Store badges, app links and the confirmation email**: see `docs/app-links.md` (badge files,
`NEXT_PUBLIC_APP_LINK_URL`, `ANDROID_CERT_SHA256`, `APPLE_TEAM_ID`, `RESEND_API_KEY`, `EMAIL_FROM`).

## 5. Edge cases and what happens

| Situation | What Peakr does |
| --- | --- |
| Visitor closes the tab mid-quiz | Answers are saved after every step under the anonymous user; `/quiz` offers "Continue where I stopped" in the same browser. |
| Pays but never creates the account | The purchase is already with RevenueCat (anonymous user) and the trial runs. After 1 hour `checkout-reminders` sends one email with a link to the success page; the trial reminder one day before the charge goes to the checkout email. |
| Opens that email link on another device | Success page → sign in with the checkout email → the claim accepts it because the verified email matches the checkout email. |
| Signs in with Google/Apple under a different email | Accepted in the same browser (signed funnel cookie); on another device the page asks to log in with the checkout email. |
| Already has an account (no subscription) | Magic link / Google / Apple signs in to it; answers, purchase and the new plan move into it (the old plan is replaced, as after a new quiz in the app). If the quiz email belongs to an account, the paywall suggests logging in first. |
| Already subscribed in the app | Signed in on the website: the paywall shows "You already have an active subscription" and no checkout. Bought anonymously first: when the account claims the checkout, the new Stripe trial is **cancelled at once** (nothing charged), the existing plan is kept, and "Get the app" / the account page say so. |
| Already had a trial (web or app) | The checkout starts without trial and the paywall says so (one trial per user, checked by email and account). |
| Deletes the account | `delete-account` cancels the Stripe subscription immediately, deletes quiz and checkout rows, the RevenueCat customer and the user. |

## 6. End-to-end test in Stripe test mode

Locally (or on a Preview deployment with test keys):

```bash
# apps/web/.env.local: all variables from § 4 with test-mode values,
# NEXT_PUBLIC_SITE_URL=http://localhost:3000
pnpm web
# second terminal – forwards Stripe events to your machine and prints the whsec_ to use:
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

1. **Happy path, new user** – open `/` → "Build my plan" → answer the quiz (reload in between:
   it resumes) → email step (tick consent, or skip) → forecast shows the load chart and week 1 →
   "Start my 7-day free trial" → paywall states the first charge date → Stripe Checkout with card
   **4242 4242 4242 4242**, any future date, any CVC → success page.
   Check in Supabase: `quiz_sessions` has the answers, `web_checkouts` a row with
   `status = complete`, `with_trial = true`, `trial_end` in 7 days; in RevenueCat the anonymous
   customer has `training` (sandbox).
2. **Create the account** – on the success page use the magic link (or the 6-digit code) for the
   checkout email → "Get the app". Check: `web_checkouts.user_id` is now the account and
   `claimed_at` is set, `plans` has one row and `workouts` its sessions for that user,
   `entitlements` has `training` with `store = stripe`, `period_type = trial`; the anonymous user
   is gone from Authentication → Users; in RevenueCat the purchase moved to the account id.
3. **App** – sign in to a development build with the same account ("Already have an account?
   Sign in" on the first screen) → the plan appears after the first sync and is fully unlocked
   (RevenueCat grants `training` from the Stripe purchase).
4. **Account page** – `/account` shows "Free trial until …", "Manage or cancel" opens the Stripe
   portal (test mode). Switch to monthly, then cancel: after the RevenueCat webhook the page says
   "Cancelled – access until …".
5. **Paid but no account** – run a second checkout in a private window and close it on the
   success page. Make the checkout old enough and call the reminder function:
   ```sql
   update web_checkouts set created_at = now() - interval '2 hours' where session_id = 'cs_test_…';
   ```
   ```bash
   curl -X POST https://<ref>.supabase.co/functions/v1/checkout-reminders -H "x-cron-secret: <CRON_SECRET>"
   ```
   One email with the link; a second call sends nothing (`reminded_at` is set). Open the link on
   another browser and finish with the checkout email.
6. **Already subscribed in the app** – with an account that has a sandbox store subscription
   (`entitlements` row with `store = play_store`), run the quiz in a private window, buy, and sign
   in with that account on the success page → "Get the app" says the new trial was cancelled; in
   Stripe the subscription is cancelled; the account's plan is unchanged.
7. **Trial reminder** – shift the trial end and run the reminder:
   ```sql
   update entitlements set expires_at = now() + interval '20 hours' where user_id = '<account id>';
   ```
   ```bash
   curl -X POST https://<ref>.supabase.co/functions/v1/trial-reminders -H "x-cron-secret: <CRON_SECRET>"
   ```
   Push + email "Your Peakr trial ends tomorrow", with the price and a link to `/account`. (The
   next RevenueCat event restores the real `expires_at`.)
8. **Other cards**: `4000 0025 0000 3155` (3-D Secure, confirm in the popup),
   `4000 0000 0000 0002` (declined – Checkout shows the error, nothing is recorded as complete).
   An abandoned checkout expires after 24 h (`checkout.session.expired` → `status = expired`).
9. **Account deletion** – Settings → Account → Delete account in the app (or the website's
   deletion request): the Stripe subscription is cancelled at once, the rows are gone.

Then repeat steps 1–2 once in live mode with a real card and refund yourself in the Stripe
dashboard.

## Not part of this phase

- Opening the installed app from "Get the app" (Android App Links / iOS Universal Links): Phase
  10d. Until then the page shows the store links and a QR code.
- Follow-up emails to visitors who left their email but did not buy: the consent is stored, the
  emails themselves are not built yet.
- Storing UTM / referrer attribution and the shared analytics events (CLAUDE.md "Growth & SEO").
- Captcha for anonymous sign-ins; buying the Gym add-on or Training + Nutrition on the website.
