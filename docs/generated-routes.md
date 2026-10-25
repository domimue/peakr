# Generated round trips (Phase 8b)

CLAUDE.md "Terrain intelligence" §2b. The route picker of a run or ride shows a third group,
**Generated round trips**, next to the user's own and the recognised routes:

1. The app builds the request from the planned session (`roundTripRequest` in
   `packages/engine/src/route/routing.ts`): start = home start point (or the current location
   once, on tap), target distance from the session's duration and its gain per km, elevation band.
2. The Edge Function `round-trips` snaps the start to ~100 m and the distance to 500 m, checks the
   `training` entitlement and the daily limit, and asks **OpenRouteService** for 5 round trips
   (seeds 0–4, `foot-walking` / `foot-hiking` for hilly runs / `cycling-road`), each retried once
   with a corrected length when it misses the target by more than 20 %.
3. Heights: ORS adds them from its global DEM (`elevation: true`). In Switzerland the function
   replaces them with **swisstopo** heights (GeoAdmin profile service, swissALTI3D / DHM25); if
   swisstopo fails, the ORS heights stay. The engine smooths every profile (100 m window) as for
   GPX imports.
4. The result is cached per user and snapped query in `route_cache` (14 days).
5. The app scores the candidates with the route matching score (`pickRoundTrips`: duration,
   elevation band, start, climb for hill sessions, surface), drops near-identical loops and shows
   the best three. Tapping one saves it to the library (source `generated`) and uses it for the
   session; "Save to library" only saves it.

## What you need to set up

| What | Where | Cost |
| ---- | ----- | ---- |
| **OpenRouteService account + API key** | Sign up at <https://openrouteservice.org/dev/#/signup> (HeiGIT account), Dashboard → *Request a token* (Standard). | Free |
| **swisstopo** | Nothing – the GeoAdmin API (`api3.geo.admin.ch`) needs no key. | Free |

Then:

```bash
pnpm exec supabase db push                      # migration 20261102000000_generated_routes.sql
pnpm exec supabase functions deploy round-trips
pnpm exec supabase secrets set ORS_API_KEY=<your token>
```

and flip `generatedRoutes` to `true` in `apps/mobile/src/config/feature-flags.ts`.

Optional secrets:

- `ORS_BASE_URL` – a self-hosted ORS or a paid endpoint instead of `https://api.openrouteservice.org`.
- `SWISSTOPO_PROFILE_URL` – a different profile endpoint.
- `ROUTING_SKIP_ENTITLEMENT=1` – development projects only (e.g. the personal build without a
  RevenueCat entitlement); never on production.

## Free limits

- **OpenRouteService Standard (free)**: Directions **2,000 requests per day, 40 per minute**.
  One generation costs 5–10 requests (5 seeds, at most one length correction each), so roughly
  **200–400 uncached generations per day**. The cache (per user, ~100 m start cell, 500 m distance
  step, 14 days) and the per-user limit of **20 uncached generations per day** keep usage low.
  Seeds are requested one after another, so one generation stays under the per-minute limit.
- **Commercial use**: the ORS plans page lists the free Standard plan as "free for everyone"; the
  higher-quota Collaborative plan is explicitly *not* for commercial use. Confirm with HeiGIT
  (enquiry@openrouteservice.org) before launch that the Standard plan covers a paid app, and ask
  about a commercial quota when usage grows – or self-host ORS (no quotas, `ORS_BASE_URL`).
- **swisstopo GeoAdmin API**: free, no key; fair use is a sustained average of about
  **20 requests per minute** (one profile request per generated candidate in Switzerland, so
  about 5 per generation). Heavier use: contact info@geo.admin.ch.

## To verify before relying on it

- ORS round-trip limits (maximum `length`; the function caps at 100 km) and the surface codes of
  `extra_info: surface` (mapped in `_shared/routing/model.ts`) against the current API docs.
- The GeoAdmin profile service: `POST` with the GeoJSON in the body, `sr=2056`, and the maximum
  `nb_points` / number of coordinates (the function sends at most 1,000 of each).

## Attribution

Shown under the generated group and on every saved generated route, and listed under
Profile → Licences: "openrouteservice.org by HeiGIT · Map data © OpenStreetMap contributors"
(ODbL) and the height source (swisstopo or the global terrain model).
