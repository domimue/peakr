# CLAUDE.md – Project context (working title: **Peakr**)

> Keep this file in the repository root. Claude Code reads it automatically at the start of every session.

## Product in one sentence
A mobile app for **Android and iOS** that covers everything around fitness and weight loss: it generates **hybrid training plans** (running, cycling and swimming – any combination up to triathlon – plus strength) from the user's goal and weekly time availability, driven by **heart-rate zones**, aware of **terrain/elevation**, with an editable calendar – and, as a paid add-on, **nutrition and body tracking** that combines food intake with completed workouts into a real energy balance.

## Two surfaces, one account
- **Website** (marketing + conversion): free calculators ("Tools"), the full quiz funnel with forecast, **checkout (Stripe)** and **account creation**. After paying, the user is sent to download the app and logs in there. The website is **not** for daily use of the plan.
- **App** (Android first, iOS later): the actual product – plan, calendar, workouts, integrations, nutrition. A new user can also do **everything inside the app**: quiz, forecast, in-app purchase, login.
- **The free calculators live on the website only.** The app has **no Tools tab and no free utilities**. Everything the calculators do is built into the plan instead: heart-rate zones, pace zones and swim CSS are computed during onboarding, shown with every workout, and can be **viewed and edited** in Profile → Training zones (change method, enter resting HR / LTHR / test results, override a zone; the plan recalculates). The only free parts of the app are the quiz, the forecast and the week-1 preview – everything after that needs an active subscription or running trial.
- Both surfaces use the **same Supabase account** and the **same entitlements** (via RevenueCat), so a plan bought on the web unlocks immediately in the app, and vice versa.
- The quiz is defined **once** in a shared package (questions, validation, branching, insights) and rendered by both web and app, so answers and forecast are identical.

### Web funnel flow
1. Visitor uses a free tool or lands from social/SEO → "Build your personal plan".
2. Quiz (anonymous, answers stored server-side under an anonymous session) → small insights between steps.
3. Optional email capture with explicit consent before the forecast (for follow-up emails if they don't buy).
4. Forecast + week 1 preview → paywall with clear price and tier choice → **Stripe Checkout** (monthly/yearly, **7-day free trial, payment details collected upfront**).
5. Success page → create account with the checkout email (magic link, Google or Apple) → the anonymous quiz answers and the generated plan are attached to that account.
6. "Get the app" page: store badges + QR code + deep link. On first app login the plan is already there.

### Website structure (public pages)
- **Home** – positioning, how it works, the USPs, social proof later, main CTA "Build my plan".
- **Features** – every feature of the app in sections (hybrid plan, heart-rate zones, terrain intelligence, calendar & real life, integrations, nutrition add-on "coming soon"), with screenshots.
- **Pricing** – both tiers, monthly/yearly toggle, what the 7-day trial means (card upfront, charge date, cancel anytime), FAQ.
- **Tools** – index page plus one page per calculator (heart-rate zones, Zone 2, pace & race predictor, swim CSS). Free, no login, each with an SEO text and a CTA into the quiz. These are the **only** place the calculators exist as standalone tools.
- **Quiz funnel** – the shared quiz, forecast, paywall, checkout, success/"Get the app".
- **Account** – login, subscription status, Stripe customer portal, account deletion request.
- **Legal** – Impressum / legal notice (Swiss sole proprietorship: name, address, email), Privacy policy (GDPR/revDSG, Supabase, Stripe, Strava and other integrations, analytics), Terms of service (subscription, trial, auto-renewal, right of withdrawal), Cookie notice if analytics are used. Linked from the footer on every page.

### App-only flow
Install → onboarding quiz (same shared package) → forecast → **in-app purchase** (Google Play / Apple) → login/account → plan. No part of the plan, calendar, workouts or integrations is usable without a subscription or running trial; there is **no free tier** in the app.

### Store rules for web purchases (must respect)
- The app may unlock subscriptions bought on the web (same account), but it must **also offer in-app purchase** and must **not link, button or steer** users from inside the app to the web checkout, except where a store explicitly allows it for that region (check current Google Play and App Store rules before adding any external link).
- Web subscribers manage/cancel via the Stripe customer portal on the website (link sent by email and shown on the website account page); app subscribers via Google Play / App Store.
- Web payments cost roughly Stripe fees (~3 %) instead of the store's 15 %, which is why the web funnel is the preferred path for new users from marketing.

## Positioning / USPs (do not dilute these)
1. **One load model for everything** – running, cycling, swimming and strength all feed one training-load budget. A hard Saturday ride makes Sunday's run easier automatically.
2. **Heart rate first** – sessions are prescribed in HR zones (esp. Zone 2); pace/power are secondary hints.
3. **Strength that fits the endurance plan** – strength is periodised together with the endurance phases.
4. **Terrain intelligence** – the app knows how hilly every session is: it suggests or generates fitting routes, adjusts duration, load and pace **per kilometre** to the gradient, and evaluates runs grade-adjusted.
5. **Fair subscription** – cheaper and simpler than Runna.
7. **Year-round & real life** – winter sports count as real training, bike/run commutes are part of the plan, irregular weeks and travel are rebuilt in seconds, and bad weather (rain, snow, ice) gets an indoor alternative.
6. **All-in-one (add-on)** – training + nutrition + body progress in one app, so the user sees exactly how much their workouts contribute to their goal.

## Target users & goals offered
Goals: 5 km/10 km, half marathon, marathon, "get fitter", "lose weight", "cycling fitness / gran fondo", "swim fitness / open-water event", **triathlon (sprint, olympic, 70.3, full distance)**, duathlon.
Disciplines: the user **freely selects any combination** of run, bike and swim (multi-select). Triathlon goals require all three. Strength: none / home / gym.
The engine must treat disciplines generically (a list of selected sports), never hard-code "run + bike".

## Tech stack (decided)
- **React Native with Expo** (latest stable SDK), **TypeScript strict**, **Expo Router** (file-based navigation)
- Use **development builds** (not Expo Go) because of native modules (billing, health data, camera). Builds via **EAS Build** (no Mac needed for iOS builds).
- State: **Zustand** (local UI/app state) + **TanStack Query** (server state)
- Local storage: **expo-sqlite + Drizzle ORM**. App works offline; server is for sync and backup.
- Animations & gestures: **react-native-reanimated** + **react-native-gesture-handler** (calendar drag & drop, transitions)
- Charts: **victory-native** (Skia-based)
- i18n: **i18next + react-i18next + expo-localization**
- Backend: **Supabase** (Auth, Postgres with Row Level Security, Edge Functions). All third-party OAuth secrets and token exchanges live in Edge Functions, **never in the app**.
- Web: **Next.js** on Vercel, Tailwind CSS, same i18n keys as the app
- Billing: **RevenueCat** as the single source of entitlements – Google Play Billing and Apple In-App Purchase in the app (`react-native-purchases`), **Stripe** on the web (RevenueCat Stripe/Web Billing integration), all mapped to the same Supabase user ID
- Health data (later phases): **Health Connect** (Android) and **HealthKit** (iOS) via Expo config plugins
- Testing: **Vitest** for the engine, **Jest + React Native Testing Library** for the app, **Maestro** for end-to-end flows
- Lint/format: ESLint + Prettier; package manager: **pnpm** workspaces

## Repository layout (monorepo)
```
/apps/web               – Next.js (App Router, TypeScript, server-rendered for SEO): landing, free tools, quiz funnel, checkout, account, "get the app"
/apps/mobile            – Expo app (Expo Router)
  /app                  – routes: (tabs)/plan, (tabs)/tools, (tabs)/profile, onboarding/*, paywall, ...
  /src/features         – tools, onboarding, plan, routes, integrations, settings, nutrition, body
  /src/ui               – design system, theme (light/dark), shared components
  /src/data             – sqlite schema (Drizzle), repositories, sync, Supabase client
  /src/i18n             – locales/en.json (+ de, fr, it, es later)
/packages/engine        – pure TypeScript training + energy engine, no React/RN imports, heavily unit tested
/packages/quiz          – shared quiz definition: questions, validation, branching, insights, i18n keys (no UI)
/packages/i18n          – shared translation files used by web and app
/supabase               – migrations, edge functions
```

## Training engine rules (source of truth for the logic)

> The full workout library (all types and levels), weekly composition, level progression and the strength modes are in **WORKOUTS.md**. Workouts come from those templates and rules, never generated freely by AI.

- **HR zones**: three methods – %HRmax, Karvonen (HR reserve) and LTHR (Friel). Default: Karvonen if resting HR known, else %HRmax. HRmax default 208 − 0.7 × age if unknown (show as estimate).
- **Unified load**: per session `load = duration_min × zone_weight` (Z1=1 … Z5=5; TRIMP-like). Strength: `duration_min × sessionRPE / 2`. Sport factors for the same zone: running 1.0, cycling 0.75, swimming 0.7 (low impact, but upper-body and technique load). Keep all factors in one config object.
- **Weekly progression**: max +10 % weekly load; every 3rd or 4th week a recovery week at ~70 %. Intensity distribution ~80/20 (Z1–2 vs Z3+).
- **Phases**: Base → Build → Peak → Taper (race goals). Non-race goals loop Base/Build blocks with recovery weeks.
- **Strength**: users choose their strength mode – Peakr programme, their own split (full body, upper/lower, push/pull/legs, body-part split, …), their own routines, or free/log only – plus a strength priority. The engine decides only when and how much (phase scaling of leg volume, heavy legs never within 24 h before a key session or the day before the long session). Details: WORKOUTS.md §8.
- **Scheduling from availability**: minutes available per weekday. Fill by priority: long session → key quality session → strength → easy sessions. Max 1 session/day unless doubles are allowed.
- **No hard days back to back**: the generator never places two hard sessions (Z4+, intervals, long session, heavy leg strength, long/steep hilly sessions) on consecutive days. If availability makes it unavoidable, it downgrades one of them and says why. If the **user** moves a workout and creates two hard days in a row, show a warning with two options: "make the other day easier" (engine adjusts) or "keep it anyway".
- **Terrain** (run and bike only) – see the section "Terrain intelligence" below.
- **Pause**: illness, injury, holiday. On resume: ≤7 days → first week 80 %, ≤14 days → 70 %, longer → 60 % and re-enter Base; then regenerate the remainder.
- **Swimming**: intensity is prescribed by **pace per 100 m from CSS (Critical Swim Speed)** – derived from a 400 m and 200 m time trial – with RPE as fallback; HR is secondary because it reads ~10–15 bpm lower in water and wrist HR is unreliable while swimming. Swim workouts are structured as warm-up / drill / main set / cool-down with sets, distances, rest intervals and pool length (25 m / 50 m / open water). Beginners get technique-focused sessions first.
- **Multisport & triathlon**: distribute weekly time across selected disciplines by goal (e.g. triathlon base roughly swim 20 % / bike 45 % / run 35 % of endurance time, adjusted to the user's weakest discipline). Include **brick sessions** (bike → run) in Build and Peak. Allow swim + run or swim + bike on the same day if doubles are allowed; never two hard sessions on one day. Race-specific taper for multisport events.
- **Editing**: moving a workout triggers a rebalance of that week (keep weekly load and spacing rules). Warn when a rule is broken, but allow it.

## Terrain intelligence (core USP)
**User flow for a session:** open today's workout → app shows 3 route options from the user's start point (home or current location): (a) the user's own routes, (b) app-generated round trips, (c) "free session" (time + HR only) → user picks one → map, elevation profile, expected duration and per-km pace plan → "send to watch" (route + structured workout) → after the activity syncs back, grade-adjusted evaluation.

1. **Terrain profile**: home terrain from the quiz (flat / rolling / hilly / mountainous); after Strava is connected, learn the real profile from recent activities (avg elevation gain per km, typical climbs).
2. **Route sources**:
   - Own library: GPX import, Komoot (later via partner API), and **routes recognised from the user's past Strava activities** (cluster similar tracks, keep start point, distance, elevation profile).
   - **Generated round trips** (phase 2 of this feature): OSM-based routing service with round-trip support (OpenRouteService or GraphHopper) behind a `RoutingProvider` interface; elevation from a DEM (swisstopo for Switzerland, an open global DEM elsewhere). Generate several candidates, pick the best match for duration and elevation band. Calls go through an Edge Function (API keys server-side), results cached.
3. **Route matching**: score routes by target duration (sport-specific speed model incl. elevation), desired elevation band (from session type and terrain profile), surface/sport suitability, distance from start. Hill sessions need a matching climb segment (e.g. 200–400 m at 5–8 %).
4. **Grade-adjusted pace (GAP)**: use the Minetti energy-cost model of running on gradients to convert between flat pace and pace on a given gradient. Split each route into 1 km segments (shorter for steep sections), compute gradient per segment and a target pace range per segment from the session's flat target pace.
   - Easy / Zone 2 sessions: **HR stays the primary target**, per-km pace is shown as guidance only.
   - Tempo, intervals, races: per-km pace targets are primary.
   - Downhill cap: on descents the target may be at most ~5 % faster than flat pace (protect legs, avoid overstriding).
5. **Duration estimate**: running via GAP; cycling via a simple power/speed model (flat speed from user level, +~10 min per 100 m gain as fallback).
6. **Load**: climbing increases session load; **long running descents add eccentric load** → more recovery afterwards and no heavy leg strength the next day. Weekly elevation gain is tracked and increases by max ~10 % per week when elevation is a goal.
7. **Hilly event preparation** (later): user uploads the target event's GPX (e.g. a mountain marathon, gran fondo); plan progresses weekly elevation, adds uphill and downhill-specific sessions, shows readiness vs. the event profile. Users without hills get substitutes (treadmill incline, stairs, trainer resistance).
8. **Evaluation**: after each synced activity show elevation, grade-adjusted pace, time in target zone and per-km comparison with the plan; progress over weeks is compared grade-adjusted.
9. **Watch export**: route as GPX/course + structured workout as FIT with one step per segment carrying its pace range (or HR zone for easy runs). With Garmin approval: push course + workout via Garmin APIs.
10. **Not in scope**: no own live GPS tracking/navigation in the app – watches and Komoot do that.

**Rollout**: launch = 1, 2 (own library + recognised Strava routes), 3, 4, 5, 6, 8, 9 (file export). Later = generated round trips, event preparation, direct push to Garmin.

## Real-life & seasonal adaptation (core USP)
1. **Winter sports**: cross-country skiing (classic/skate), ski touring, snowshoeing count as endurance sessions with their own load factors (config: XC skiing 0.8, ski touring 0.85 + elevation load, snowshoeing 0.9 – low impact, full body). Users select in the quiz which winter sports they do. From a user-defined winter period (default Dec–Mar, or when they log winter activities) the plan **offers winter variants** of easy/long sessions (e.g. long run → long XC ski session of equivalent load). Strava sport types NordicSki, BackcountrySki, Snowshoe are imported and counted. Key quality sessions for a race goal stay in the target sport.
2. **Commuting**: user defines commute(s) once – sport (bike/run/walk), one-way duration or a route, which weekdays, one or both ways. The scheduler places commutes as easy sessions (Z1–2) **before** filling the remaining availability, counts them towards load, and avoids stacking hard sessions on heavy commute days. Synced commute activities are matched automatically. A commute can be skipped for a day with one tap (e.g. rain).
3. **Irregular weeks & travel**: per week the user can override availability ("only 3 days this week", "away Mon–Wed") → that week is rebuilt keeping the weekly load as far as possible and the spacing rules. **Travel mode**: for chosen dates, strength switches to bodyweight/hotel-room exercises, runs are kept time-based, bike/swim sessions are replaced by available alternatives; the route feature suggests runs around the travel location.
4. **Weather check (rain, snow, ice only – no heat logic)**: each morning (and when opening the day) fetch the forecast for the user's location for the planned session time. If heavy rain, snowfall, freezing rain/ice or storm is expected, show a hint with an **indoor alternative of equivalent load**: run → treadmill (incline matched to the planned terrain where relevant), bike → indoor trainer, outdoor swim → pool, plus "move to another day" with the week rebalance. Optional morning push notification. User always decides; nothing changes automatically. Weather data behind a `WeatherProvider` interface, called via an Edge Function and cached per location/hour (candidates: MeteoSwiss open data for Switzerland, Open-Meteo for everywhere else – check licence/commercial plan before launch).

## Energy & body rules (nutrition add-on)
- **Resting energy**: Mifflin-St Jeor by default; Katch-McArdle if body fat % is known. Overridable by Health Connect/HealthKit resting energy.
- **Active energy**: from completed workouts (Strava/Health data) or, if missing, estimated from planned workouts (duration, zone, body weight). Use only ~75 % of device-reported active energy by default (configurable) because wearables tend to overestimate.
- **Energy balance**: intake − (resting + active). Fat estimate 7,700 kcal per kg, shown as an estimate.
- **Weight trend**: exponentially smoothed trend line; day-to-day scale changes are labelled as water/glycogen noise.
- **Body composition** (optional): body fat %, body measurements (waist, hips, chest, arms, thighs …) with measurement instructions, progress photos (stored privately).
- **Safety (mandatory)**: max target loss rate 1 % of body weight per week; intake target never below max(BMR, 1,500 kcal men / 1,200 kcal women) – show a warning instead of a lower target; no "rewards" for very low intake; protein target 1.6–2.2 g/kg during weight loss. Users under 18 cannot use the weight-loss goal. Health disclaimer in onboarding.

## Integrations – constraints to respect
- **Strava**: OAuth via Edge Function. Import runs, rides and swims. Use activities only to adapt *that user's* plan. Never show one user's Strava data to others, never use it to train AI/ML models (Strava API Agreement, Nov 2024).
- **Automatic activity sync (required)**: once an account is connected, every newly recorded activity appears in the app **automatically, without the user opening anything**.
  - Strava: **Strava Webhook Events API** (push subscription) → Supabase Edge Function → fetch activity details → store in Postgres → app receives it via Supabase Realtime (foreground) or a push notification (background) and syncs into SQLite. Also handle activity `update` and `delete` events and athlete deauthorisation.
  - Garmin: **Garmin Activity API** push/ping notifications (part of the Garmin Connect Developer Program, approval required) → same pipeline. Until approved: rely on Strava (most Garmin users auto-sync to Strava) and on Health Connect / HealthKit as fallback sources.
  - **Deduplication**: the same workout can arrive from Garmin, Strava and Health data. Treat activities as the same if sport matches and start times differ by ≤ 5 min and durations by ≤ 10 %; keep one record with a source priority (watch provider > Strava > Health data) and remember all source IDs.
  - After import: match to the planned workout (same day, same sport) and mark it done; unplanned activities count towards load and trigger a rebalance. Notify the user briefly ("Run synced from Strava – Thursday's session marked as done").
  - A manual "sync now" pull exists as backup, plus a nightly catch-up job in case a webhook was missed.
- **Watch integrations (all behind one `WatchProvider` interface)**: each provider can (a) push planned structured workouts (and routes where supported) to the watch, (b) deliver completed activities into the import pipeline. The user picks their watch in onboarding/profile. Universal fallback for every brand: export FIT workout + GPX route files.
  - **Garmin**: see below (Training API + Activity API, developer program approval).
  - **COROS**: COROS partner API (apply to COROS) – push structured run/bike/swim workouts as a training plan visible in the COROS app/Training Hub, sync roughly the next 7 days, re-sync on change; completed activities via the API. Strength is not supported for push → show strength in the app only. Note: deleting a pushed workout may not remove it on COROS – handle by updating/renaming.
  - **Suunto**: Suunto Cloud API (partner programme, business application, ~2 weeks review) – push routes (GPX) and workouts (FIT) to the Suunto app/watch; workout webhooks for completed activities. Confirm with Suunto during onboarding whether planned structured workouts are supported; otherwise routes + FIT export.
  - **Apple Watch** (comes with the iOS release): **WorkoutKit** on the iPhone schedules custom workouts (steps, repeat blocks, pace/heart-rate/power alerts) into the Apple Watch Workout app, locally on the device (no server, user permission required); completed workouts via **HealthKit**. Needs a small native Expo module in Swift (`modules/workoutkit`), iOS only.
  - Activity source priority for deduplication: watch provider (Garmin/COROS/Suunto/Apple) > Strava > Health Connect/HealthKit.
- **Zwift** (indoor cycling and running): when a session is indoors (indoor alternative from the weather check, travel mode, trainer sessions, winter), offer **"Send to Zwift"**.
  - Phase 1: generate a **.zwo** workout file (Zwift's custom workout XML; bike in % FTP, run in pace) that the user saves into their Zwift workouts folder on PC/Mac; it then appears on all their Zwift devices after restart (files < 64 KB). Show short instructions.
  - Phase 2: **Zwift Training Connections** API (partner programme, Zwift approves platforms): push scheduled workouts directly into the user's Zwift account so they appear when Zwift opens; behind a `ZwiftProvider` + feature flag until approved.
  - Completed Zwift rides/runs come back via Strava (or the watch) through the normal pipeline; deduplicate with the watch.
- **Garmin**: Phase 1 = export structured run, bike and **swim** workouts (incl. pool length and rest steps) as **.FIT workout files** (official Garmin FIT JavaScript SDK) that the user imports into Garmin Connect. Phase 2 = **Garmin Connect Training API** (push to Garmin Connect → watch), requires approval in the Garmin Connect Developer Program; build behind an interface + feature flag.
- **Komoot**: official API is **partner-only** (contract required). Phase 1 = GPX import + stored Komoot profile URL. Phase 2 = official Komoot OAuth (scopes `profile`, `tour-upload`) behind an interface + feature flag. **No scraping.**
- **Hevy** (strength): personal API key (Hevy Pro, no OAuth) pasted by the user, stored encrypted server-side; Edge Function polls workouts and routines; imported workouts keep exercises/sets/weights; routines become "My own routines". See WORKOUTS.md §8.7.
- **Food database**: **Open Food Facts** for barcode lookup (free, ODbL – show attribution, cache results, let users correct entries). Users can create custom foods and recipes.
- **Health Connect / HealthKit**: read weight, steps, resting and active energy, workouts; write nutrition and workouts where allowed. Request only the permissions actually needed.

## Monetisation
- **Free without subscription**: on the **website** the calculators ("Tools"), the full quiz and the forecast with the week-1 preview; in the **app** only the quiz, the forecast and that same week-1 preview. There is **no free tier and no free tools inside the app** – after the forecast the paywall is the only way forward.
- **Two tiers** (one subscription group, so users can switch):
  - **Training** (target ~7.90/month or ~59/year): full plan, calendar editing, regeneration, pause, routes, integrations, exports.
  - **Training + Nutrition** (target ~11.90/month or ~89/year): everything in Training plus nutrition tracking with barcode scan, energy balance, body tracking. Until the nutrition part ships, this tier is shown as "coming soon".
- **7-day free trial**: the user **starts the subscription right after the forecast** and enters payment details upfront (Google Play / App Store / Stripe). Nothing is charged for 7 days; the paywall states the exact first charge date. **One day before the trial ends** the app sends a reminder (push + email) with the charge date, amount and a direct link to cancel. One trial per user/account.
- Paywall appears **after** the quiz and forecast, on the web (Stripe) and in the app (in-app purchase). Entitlements handled via RevenueCat (`training`, `plus`) regardless of where the user paid.
- **Manage subscription in the app** (Profile → Subscription): see current tier, price, next billing date and trial status; **upgrade/downgrade** between Training and Training + Nutrition and switch monthly/yearly (via the store's subscription change flow; web subscribers via the Stripe customer portal); **cancel easily** without deleting the account (deep link to the store's cancel screen for app purchases, Stripe portal for web purchases). After cancelling, access stays until the end of the paid period; afterwards the user keeps the account, history and free tools, the plan becomes read-only.

## Account & notifications
- **Log out** and **delete account** in Profile → Account. Deletion: confirmation step (type "DELETE" or confirm twice), explains that an active subscription must be cancelled separately in the store (with link) and that all data is removed; deletes all user data in Supabase (incl. storage, integration tokens, revoking Strava/Garmin access) within the store's required timeframe; also offered on the website (Google Play requires a web deletion link).
- **Daily workout reminder**: **one** push notification per day, sent in the morning (default 07:00 local, user can change or turn off), only on days with a planned workout, naming the workout (e.g. "Today: Easy run, 50 min, Zone 2"). No time-of-day for the workout, no further pushes that day. Weather hints are merged into this same notification when relevant (e.g. "…rain expected this evening, indoor option available"), never a second push.
- **Trial ending reminder**: one push + email one day before the trial converts (see Monetisation).
- Other notifications (activity synced) are in-app only, not push, unless the user enables them.

## Localisation
- Ship **English first**. All user-facing text via i18next keys from day one (no hard-coded strings). Prepare for de, fr, it, es. Units: metric default, imperial optional.

## Platform strategy
- **Android first**: build, test and release on Android first. iOS follows from the **same codebase**.
- Stay iOS-compatible from day one: only use libraries that support both platforms; put unavoidable platform code behind one interface with `.android.ts` / `.ios.ts` files (e.g. health data); no Android-only UI patterns.
- iOS-specific items for later: HealthKit, Sign in with Apple, App Store products in RevenueCat, App Store review.

## Conventions
- Engine code (`/packages/engine`) is pure TypeScript, deterministic, and every rule above has unit tests.
- Small, reviewable steps; run `pnpm lint && pnpm typecheck && pnpm test` before saying a step is done.
- Ask before: adding a paid service, changing the stack, or changing a rule in this file.
