# Task queue

Prompts the user has given that are not finished yet. Newest at the bottom;
work top to bottom. See "Working mode (Claude sessions)" in CLAUDE.md.

Hourly check-in (scheduled task): `trig_01DmNLehfxTzPBLXaDznAdvU` (branch claude/bold-pascal-ozm0yd)

## Open


## Done

- Current training instead of Strava in the quiz (2026-10-27): Strava step removed from the quiz
  and the new-plan flow (recalibration stays in Profile → Training zones); step "Your current
  training" – Peakr's estimate or own km/h/m per week – sets start load and floors; nothing to set up

- Sessions per discipline (2026-10-27): quiz step before the availability (Let Peakr suggest / I
  choose, starting at the suggestion), engine plans the asked numbers, check against days, Profile →
  Availability edits it; also: plan start floors fixed for short days; nothing to set up

- Prompt 4 – Recipes and portions (2026-10-27): engine recipe maths (totals, per portion, cooked
  weight, units, scaling, relog), recipe editor with photo / note / ingredients through the same
  search, scanner, favourites and manual entry, log by portion or grams, "My recipes" filter,
  edit / duplicate / scale / delete, logged days kept unless chosen; CLAUDE.md + docs updated;
  nothing to set up (no migration)

- Prompt 3 – Navigation and screens (2026-10-27): tabs Today/Plan/Gym/Nutrition/Body with the
  profile icon on every screen, Profile vs. Settings, Plan → History, Today as one day, weekly
  volume per sport, workout types rows, Strava route preview, congratulation push, Body tiles /
  change colours / measurements table, coach in Nutrition, chart colours; CLAUDE.md updated;
  nothing to set up (no migrations); Maestro flows updated but not run here (no emulator)

- New plan without a new account (2026-10-27): weekly session mix (threshold/VO2 rotation), plan
  archive with outcome and same-day undo, Insights "This plan / All time", badges, Plan history
  with JSON export, "Create a new plan" flow starting from the previous plan, review "How was
  your last plan?"; CLAUDE.md + WORKOUTS.md updated; waits on the user for the Supabase migration
  `20261109000000_plan_archive.sql` and `supabase functions deploy delete-account`
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
