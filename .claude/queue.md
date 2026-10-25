# Task queue

Prompts the user has given that are not finished yet. Newest at the bottom;
work top to bottom. See "Working mode (Claude sessions)" in CLAUDE.md.

Hourly check-in (scheduled task): `trig_01JGRKJomHcy59JEsWHvfDNY`

## Open

- Phase 8b – Generated round trips: RoutingProvider with OpenRouteService via an Edge Function,
  DEM elevation (swisstopo in CH, global DEM elsewhere), matching score, cache per user and start,
  third option in the route picker, save to library; tell the user accounts, keys and free limits

## Done

- Phase 10d – App links, deep links & "Get the app"; waits on the user for the domain,
  fingerprints, Team ID and badge files (docs/app-links.md)
- Phase 10c – Account, notifications & hard-day rule; deploy the migration and the
  `daily-reminders` / `delete-account` functions (supabase/README.md)
- Phase 10b – Website quiz funnel, Stripe checkout & account; waits on the user for the
  Stripe/RevenueCat/Supabase/Vercel setup (docs/web-checkout-setup.md)
- Phase 10 – Subscriptions & paywall (app); waits on the user for the store/RevenueCat setup (docs/subscriptions-setup.md); email via Resend (approved)
- Phase 9d – Health tab (Garmin + Health Connect); waits on the user for Garmin field checks (docs/health-garmin.md)
- Claude GitHub Action for `@claude` mentions, OAuth token only
