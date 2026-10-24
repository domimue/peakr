# Phase 10b – Website: quiz funnel, Stripe checkout & account

Prompt: render the shared quiz on the web (one question per screen, animated progress, answers
under a Supabase anonymous session so users can resume), optional email capture with consent,
forecast with load chart and week 1, paywall → Stripe Checkout (monthly/yearly, 7-day trial, card
upfront, reminder one day before) via RevenueCat's Stripe integration (entitlement `training` for
the same user), success page → account (magic link, Google, Apple) with answers + plan attached,
"Get the app" (badges + QR, first version), account page (status + Stripe portal). Edge cases: paid
but no account (reminder email), existing account, already subscribed in the app. Explain Stripe /
RevenueCat / Supabase setup and the end-to-end test in Stripe test mode.

## Decisions

- **Texts**: the quiz, plan notes, why texts, step notes, workout texts, workout names, strength
  and exercise names move from the app's `en.json` to `packages/i18n` (`plan.json`,
  `exercises.json`); the app spreads them into its resources (same keys), the web reads them with
  a small translator that also handles `_one/_other` plurals. Workout text helpers move to
  `@peakr/quiz` (`workout-text.ts`) so both surfaces describe week 1 the same way.
- **Anonymous session**: Supabase Auth anonymous sign-in on the website (cookies via
  `@supabase/ssr`, refreshed in `src/proxy.ts` for the funnel/account/auth paths only, so the
  marketing pages stay static). Answers live in `quiz_sessions` (one row per user, RLS own row).
  A signed httpOnly cookie `peakr_funnel` remembers the anonymous user id, so signing in to an
  account (which replaces the anonymous session) can still claim it.
- **Checkout**: our own Stripe Checkout Session (mode subscription, `trial_period_days: 7`,
  `payment_method_collection: always`, missing payment method → cancel), `client_reference_id` and
  metadata `app_user_id` = the current Supabase user (anonymous or account). No trial when the
  email/user already had one (one trial per user). Prices come from Stripe (price ids in env), so
  the paywall shows exactly what is charged.
- **RevenueCat**: after `checkout.session.completed` (Stripe webhook route in Next.js, and again on
  the success page – idempotent) the server posts the subscription to RevenueCat
  (`POST /v1/receipts`, `X-Platform: stripe`, Stripe public app key) for `app_user_id`, plus the
  attributes `peakr_price` / `peakr_product` the trial reminder reads. The existing
  `revenuecat-webhook` mirrors it into `entitlements` (store `stripe`); `trial-reminders` already
  links Stripe users to /account.
- **One claim path**: the account is always created/signed in with the checkout email (magic link)
  or Google/Apple; `claimFunnel()` then moves the anonymous user's quiz session and checkout to
  the account (proof: the funnel cookie, or the account's verified email = checkout email), re-posts
  the receipt to RevenueCat under the account (transfer), updates the Stripe metadata, writes the
  plan (`plans` + `workouts`, same rows the app syncs) and deletes the anonymous user.
- **Existing account / already subscribed**: the checkout route refuses when the signed-in user
  already has `training`; the paywall offers "Already have Peakr? Sign in"; when a claim finds the
  account already had an active `training` from another store, the new Stripe trial is cancelled
  at once (nothing charged) and the account page says so. An existing plan is kept when the
  account was already subscribed, otherwise replaced by the new quiz plan (like the app).
- **Paid but no account**: pg_cron hourly → Edge Function `checkout-reminders`: completed,
  unclaimed checkouts older than 1 h get one email with a link back to the success page. The
  trial reminder falls back to the checkout email for unclaimed (anonymous) users.
- **Account deletion** also cancels the user's Stripe subscriptions (no store to cancel them in).
- Funnel, checkout, account and auth pages are `noindex` and not in the sitemap.

## Steps

1. [x] i18n: shared `plan.json` + `exercises.json`, app uses them, web translator; workout text
       helpers in `@peakr/quiz`; tests
2. [x] Supabase: migration (`quiz_sessions`, `web_checkouts`, helper functions, cron),
       `checkout-reminders`, trial reminder email fallback, delete-account cancels Stripe
3. [ ] Web infra: deps (`@supabase/ssr`, `stripe`, `qrcode`), server/browser clients, proxy,
       funnel cookie, `/auth/callback`, `/login`
4. [ ] Quiz runner + save/resume actions, `/quiz`, email capture
5. [ ] Forecast page (load chart, week 1)
6. [ ] Paywall + checkout action, Stripe webhook, RevenueCat client
7. [ ] Success page, claim (plan rows), `/get-app`
8. [ ] `/account`: status, portal, sign out
9. [ ] CTAs into the funnel (home, header, features, pricing, tools), waitlist UI removed
10. [ ] App: "I already have an account" on the intro screen
11. [ ] Docs: `docs/web-checkout-setup.md`, supabase/README, queue
