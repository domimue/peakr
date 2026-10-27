# Task queue

Prompts the user has given that are not finished yet. Newest at the bottom;
work top to bottom. See "Working mode (Claude sessions)" in CLAUDE.md.

Hourly check-in (scheduled task): `trig_01DmNLehfxTzPBLXaDznAdvU` (branch claude/bold-pascal-ozm0yd)

## Open

- New plan without a new account, plan history, badges, review, weekly session mix
  (2026-10-27; plan in `.claude/plans/plan-history.md`). Steps:
  - [x] A – weekly session mix (rotation, audit, property tests)
  - [x] B – plan archive & outcome (SQLite + Supabase, sync, `planOutcome`)
  - [x] E+F – scopes "This plan / All time", badges, plan history screen, JSON export
  - [x] C – "Create a new plan" flow (Profile row, prefilled quiz, Strava recalibration, confirmation, start from the previous plan, auto-archive at the end)
  - [x] D – review "How was your last plan?" (measured, quick taps, changes with reasons, saved with the archive)
  - [ ] G – CLAUDE.md / WORKOUTS.md, final report

## Done

- Engine phase (2026-10-27): plan start floors, intensity bands, difficulty slider, energy &
  macros, activity matching, CLAUDE.md updated; nothing to set up (no migrations; new settings
  stay on the device)
- Garmin health data not arriving (2026-10-27): v2 daily-summary mapper, per-endpoint pull, SpO2
  day + VO2max from activities, backfill button, empty-state cases, OAuth permissions,
  diagnostics; waits on the user for the Supabase migration `20261108000000_health_diagnostics.sql`,
  `supabase functions deploy garmin-health oauth watch-webhook` and a new personal build
  (docs/health-garmin.md)
- Phase 16 – Body dashboard, coach & paywall; nothing to set up (docs/body-addon-setup.md §12)
- Phase 15 – Body check-in; waits on the user for the Supabase migration
  `20261107000000_body_checkin.sql` (private `body-photos` bucket) and a new dev build
  (expo-image-picker) (docs/body-addon-setup.md §11)

- Phase 14 – Food logging with barcode scan; waits on the user for the Supabase migration,
  a new dev build (expo-camera), the Play health declaration for WRITE_NUTRITION and the OFF
  User-Agent contact (docs/body-addon-setup.md §10)
- Phase 13 – Weight goal & weekly rate; waits on the user for the Supabase migration
  `20261105000000_body_goals.sql` (docs/body-addon-setup.md §9)
- Phase 12 – Energy engine & health data; waits on the user for the Play health-permission
  declaration, the Supabase migration and a check of Garmin `bmrKilocalories`
  (docs/body-addon-setup.md §8); HealthKit stays a stub until the iOS release
- Phase 11b – Body add-on integration & entitlement (`body_nutrition`, bundle "Peakr + Body",
  guard, Body tab in place of Insights – user decision 2026-10-26, remote flag
  `addon_body_nutrition`); waits on the user for store/RevenueCat products, prices and the
  Supabase migration (docs/body-addon-setup.md)
- Phase 8b – Generated round trips (OpenRouteService + swisstopo); waits on the user for the
  ORS key and the feature flag (docs/generated-routes.md)
- Phase 10d – App links, deep links & "Get the app"; waits on the user for the domain,
  fingerprints, Team ID and badge files (docs/app-links.md)
- Phase 10c – Account, notifications & hard-day rule; deploy the migration and the
  `daily-reminders` / `delete-account` functions (supabase/README.md)
- Phase 10b – Website quiz funnel, Stripe checkout & account; waits on the user for the
  Stripe/RevenueCat/Supabase/Vercel setup (docs/web-checkout-setup.md)
- Phase 10 – Subscriptions & paywall (app); waits on the user for the store/RevenueCat setup (docs/subscriptions-setup.md); email via Resend (approved)
- Phase 9d – Health tab (Garmin + Health Connect); waits on the user for Garmin field checks (docs/health-garmin.md)
- Claude GitHub Action for `@claude` mentions, OAuth token only
