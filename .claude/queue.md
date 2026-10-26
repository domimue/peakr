# Task queue

Prompts the user has given that are not finished yet. Newest at the bottom;
work top to bottom. See "Working mode (Claude sessions)" in CLAUDE.md.

Hourly check-in (scheduled task): `trig_01CLCwz6RBurU45vsaGJYsmn` (this branch, claude/focused-bell-520msa)

## Open

- Phase 11b – Add-on integration & entitlement (`body_nutrition`, guard, Body tab in place of
  the Insights tab – user decision 2026-10-26, locked states, shared profile, 14-day trial,
  cancel = read-only, remote flag `addon_body_nutrition`)

## Done

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
