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
- **Get the app** – reached from the checkout success page, the account page and the header. One button that opens the installed app and otherwise leads to the store, plus the official Google Play and App Store badges and a QR code on desktop. Technically this is Android App Links and iOS Universal Links on our own domain; the store is the fallback, never the first stop for someone who already has the app.
- **Legal** – Impressum / legal notice (Swiss sole proprietorship: name, address, email), Privacy policy (GDPR/revDSG, Supabase, Stripe, Strava and other integrations, analytics), Terms of service (subscription, trial, auto-renewal, right of withdrawal), Cookie notice if analytics are used. Linked from the footer on every page.

### App-only flow
Install → onboarding quiz (same shared package) → forecast → **in-app purchase** (Google Play / Apple) → login/account → plan. No part of the plan, calendar, workouts or integrations is usable without a subscription or running trial; there is **no free tier** in the app.

**The next plan, same account** (see "Plan history"): Profile → Create a new plan → "How was your last plan?" → the quiz with the earlier answers (current availability, race date asked again when it has passed, current training) → forecast → confirmation (start date, what is archived, what stays, what goes) → new plan. No new account and no second purchase; without an active subscription or trial the row leads to the paywall. When a plan ends on its own, Today and Plan offer the next one.

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
  /src/ui               – design system, theme (dark by default, light optional), shared components, brand logo components
  /src/data             – sqlite schema (Drizzle), repositories, sync, Supabase client
  /src/i18n             – locales/en.json (+ de, fr, it, es later)
/packages/engine        – pure TypeScript training + energy engine, no React/RN imports, heavily unit tested
/packages/quiz          – shared quiz definition: questions, validation, branching, insights, i18n keys (no UI)
/packages/i18n          – shared translation files used by web and app
/packages/theme         – design tokens (colours, spacing, radii, typography, zone + workout-type colours), logo geometry, Peakr-Display font; pure TypeScript, no RN/web deps
/tools/brand-assets     – generates app icon, adaptive/monochrome icon, splash, favicons, PWA icons, OG image (`pnpm brand:assets`)
/supabase               – migrations, edge functions
```

## Training engine rules (source of truth for the logic)

> The full workout library (all types and levels), weekly composition, level progression and the strength modes are in **WORKOUTS.md**. Workouts come from those templates and rules, never generated freely by AI.

- **HR zones**: three methods – %HRmax, Karvonen (HR reserve) and LTHR (Friel). Default: Karvonen if resting HR known, else %HRmax. HRmax default 208 − 0.7 × age if unknown (show as estimate). The zone table in Profile → Training zones is a **reference** in the method the user picked; every row can be set by hand.
- **Intensity, not a zone number**: a session prescribes an intensity (recovery, easy/aerobic, tempo, threshold, VO2) with an explicit **bpm band that does not depend on the display method**. The band is a share of LTHR – the measured one, else estimated as resting HR + 0.83 × HR reserve, else 0.88 × HRmax: recovery 0.68–0.78, easy 0.78–0.90, tempo 0.90–0.95, threshold 0.95–1.00, VO2 1.00–1.06 (capped at HRmax) – e.g. easy 139–159 bpm for LTHR 178. A range the user set by hand for a zone wins. Zones set on Strava are a display choice and do not move targets. Steps keep their zone number for the load model; the workout screen always shows the bpm band with the zone as a label ("Easy · 139–159 bpm (Zone 2)"). Factors in `zoneConfig.hr.prescription`.
- **Unified load**: per session `load = duration_min × zone_weight` (Z1=1 … Z5=5; TRIMP-like). Strength: `duration_min × sessionRPE / 2`. Sport factors for the same zone: running 1.0, cycling 0.75, swimming 0.7 (low impact, but upper-body and technique load). Keep all factors in one config object.
- **Weekly progression**: max +10 % weekly load; every 3rd or 4th week a recovery week at ~70 %. Intensity distribution ~80/20 (Z1–2 vs Z3+).
- **Difficulty 1–10** (Profile → Difficulty, default 5 = exactly what the engine computes): above 5 every weekly target and the long-session increase scale up (×1.04 per step, 1.20 at 10); below 5 the growth of the loading weeks slows (+7 % at 5 down to holding the load at 1) and the long-session increase shrinks – so no week loses its structure. Applied by regenerating from today; completed weeks never change. The +10 % cap (measured against the actual previous week), recovery weeks, 80/20, no hard days back to back and the start floors still hold at every setting. Before applying, the app shows sessions per week, volume per sport and the longest session for the next four weeks. It is not a repair tool for a wrong starting point – fix the baseline instead.
- **Phases**: Base → Build → Peak → Taper (race goals). Non-race goals loop Base/Build blocks with recovery weeks.
- **Strength**: users choose their strength mode – Peakr programme, their own split (full body, upper/lower, push/pull/legs, body-part split, …), their own routines, or free/log only – plus a strength priority. The engine decides only when and how much (phase scaling of leg volume, heavy legs never within 24 h before a key session or the day before the long session). Details: WORKOUTS.md §8.
- **Current training** (quiz step after the sport steps, no Strava): "Let Peakr estimate" (default – the start load follows the level) or "I enter it": per selected sport the usual week of the last month – run km/week, ride h/week, swim m/week – prefilled with Peakr's estimate for the level (engine `currentTrainingEstimate`, `planConfig.current.estimate`); pace comes from the run step (race time or easy pace). Own numbers set `baseline.weeklyMin` and `startLoad` (`applyCurrentTraining`), so the start floors hold that week; for the next plan they win over the previous plan's weekly minutes.
- **Sessions per discipline**: the quiz asks, before the daily availability, how many sessions per week the user wants per discipline – or leaves it to Peakr (default "Let Peakr suggest"; the suggestion, engine `suggestedSessions` from goal and level, is shown and is the starting value of "I choose"). Own numbers (`profile.sessionsPerWeek`) are planned as asked: too many → the lowest-priority sessions of that sport go (long and key sessions stay longest), too few → easy sessions are added. The quiz checks that the days with time hold them (unless two a day are allowed). More sessions mean more training, not shorter sessions: the first (full) week of a new plan is rebuilt with a higher target until every own easy session has a useful length (`planConfig.sessions.ownMinMin`: run 35, ride 45, swim 30 min), as far as its day holds it; the +10 % rule carries it on from there. The start floors still apply on top. Editable in Profile → Availability; only own numbers are stored, a suggestion follows goal and level.
- **Scheduling from availability**: minutes available per weekday. Fill by priority: long session → key quality session → strength → easy sessions. Max 1 session/day unless doubles are allowed.
- **No hard days back to back**: the generator never places two hard sessions (Z4+, intervals, long session, heavy leg strength, long/steep hilly sessions) on consecutive days. If availability makes it unavoidable, it downgrades one of them and says why. If the **user** moves a workout and creates two hard days in a row, show a warning with two options: "make the other day easier" (engine adjusts) or "keep it anyway".
- **Terrain** (run and bike only) – see the section "Terrain intelligence" below.
- **Pause**: illness, injury, holiday. On resume: ≤7 days → first week 80 %, ≤14 days → 70 %, longer → 60 % and re-enter Base; then regenerate the remainder.
- **Swimming**: intensity is prescribed by **pace per 100 m from CSS (Critical Swim Speed)** – derived from a 400 m and 200 m time trial – with RPE as fallback; HR is secondary because it reads ~10–15 bpm lower in water and wrist HR is unreliable while swimming. Swim workouts are structured as warm-up / drill / main set / cool-down with sets, distances, rest intervals and pool length (25 m / 50 m / open water). Beginners get technique-focused sessions first.
- **Multisport & triathlon**: distribute weekly time across selected disciplines by goal (e.g. triathlon base roughly swim 20 % / bike 45 % / run 35 % of endurance time, adjusted to the user's weakest discipline). Include **brick sessions** (bike → run) in Build and Peak. Allow swim + run or swim + bike on the same day if doubles are allowed; never two hard sessions on one day. Race-specific taper for multisport events.
- **Editing**: moving a workout triggers a rebalance of that week (keep weekly load and spacing rules). Warn when a rule is broken, but allow it.
- **Weekly quality mix** (WORKOUTS.md §9): every run goal gets both threshold and VO2 work. A rotation over the Build/Peak **loading** weeks (recovery and benchmark weeks do not use a turn) moves the distance's other quality into the key slot every third week: 5K threshold, 10K/HM VO2 (HM Peak every second week, shorter), marathon a shorter VO2 set. A VO2 set that does not fit the day becomes threshold work, never an easy run. `profile.qualityEmphasis` (`more` / `less`, set by the plan review) makes the VO2 turn every second / fourth week; 80/20 still holds.

## Plan history (new plan in the same account)
- **Archive, never delete**: starting a new plan archives the current one as a read-only snapshot (`plan_archive`, synced, deleted with the account). Its done and skipped sessions stay the user's history; its planned sessions from today on, manual changes, irregular weeks and travel go. A same-day **undo** (Profile → Plan history) brings the previous plan back and discards the new one.
- **Outcome** (`planOutcome`, `planConfig.completion`): `completed` = ran through all its weeks with at least **80 % of its sessions done**; `finished` = ran through, fewer done; `replaced` = a new plan started before its end – **never completed**, whatever was done. Sessions are counted (commutes are no session of their own, sessions inside a pause are not planned). A plan whose last day has passed is archived on its own as completed or finished.
- **Badges** (`planBadges`) come only from completed plans: one per plan (goal + month) and once each "first plan completed", "first multisport plan", "all in" (≥ 95 % done). No streaks, nothing about weight or food. Our own graphic (Peakr mark), shown in Plan history and Plan → History → Records.
- **Start from what was done**: the next plan's start values come first from the previous plan's sessions (`historyBaseline`: median long session of the last six weeks, weekly minutes per sport and load of the last four full weeks, the level reached per workout template), merged with the fresh Strava baseline – the higher value per sport wins. The start floors apply as for any new plan; the start week the volume floor is checked on is rebuilt with a higher target (within the availability) before the plan is refused.
- **Review "How was your last plan?"** (`planReview`, `reviewAdjustments`, `applyReview`; all optional, skippable): measured – completion per session group, most skipped types, downgraded sessions, missed weeks, pauses, easy-pace trend and long runs in the easy band from linked activities ("not enough data" otherwise). Asked – overall, long sessions, hard sessions, time per week, a break because of pain or discomfort (no diagnosis), wishes. Effects, each shown with its reason: start levels +1 (≥ 80 % done and "right"/"too easy") or −1 ("too hard" or < 60 % done); a difficulty suggestion ±1 the user can decline; `qualityEmphasis`; strength priority; long session +10 % or down to the floor (never below it); time answers point to the availability step. A break for pain or discomfort starts lower on purpose (resume rule: 80 % of the recent load, one level lower, no floors) and says "if this persists, talk to a doctor". The answers are stored with the archived plan.
- **History scope**: Plan → History (sessions and Records) shows "This plan" or "All time" (every plan ever) once a plan is archived, always labelled; personal bests and lifetime totals are always all time. Archived sessions are labelled with their plan and read-only.

## Baseline from past activities (plan calibration)
Optional, and **not part of the quiz** (Strava units confused people while creating a plan): in Profile → Training zones the user connects Strava and lets Peakr read their **recent** training to calibrate the plan. During plan creation the quiz asks for the current training instead (see "Current training").

- **Scope**: runs, rides and swims from the **last 2 months**, nothing older. The user sees the list and chooses – all of them, or individually ticked. Nothing is read without that explicit choice, and skipping is always possible; the plan then falls back to the quiz answers.
- **What it calibrates**: current weekly volume and frequency per sport, longest recent session, typical easy pace and the pace–HR relationship, observed HRmax and an LTHR estimate, swim CSS estimate, usual terrain (elevation per km), and from all of that the **starting level** (WORKOUTS.md §10) and week 1 of the plan.
- **Reference only – this is the important rule.** These activities are **not** training history. They are never added to the completed sessions, never shown in the Progress history, never counted towards weekly load, streaks, records or plan completion, and never matched to a planned workout. They live in their own store (`baseline_activities`), are used once to derive the starting values, and are clearly labelled as reference data in the UI.
- **Transparent and editable**: Peakr shows what it derived and from how many activities ("easy pace around 6:10 /km, from 8 runs") and the user can override every value; the user's own entry always wins. Outliers (a race, one hard group ride) are unticked by default with a reason, and the statistics use robust measures (median, trimmed mean) with a minimum number of activities per derived value – below that, "not enough data" instead of a bad number.
- **Kinds first, then outliers**: activities are classified per sport relative to the person's own sessions – `long` (≥ 1.4 × their median duration and ≥ 60 min run / 120 min ride / 45 min swim), `other` (races), `easy` (the rest) – and outliers are only looked for inside one kind. A long run is compared with long runs and never dropped for being longer than the easy runs. The typical long session is the median long session of the last six weeks (with its distance).
- **Hard floors of a new plan** (statistics-free; sources: Strava, the quiz and – for the next plan in the same account – the previous plan's sessions): the first long session is at least 90 % of the recent typical long session, and week 1 holds per sport at least the mean weekly minutes of the last four weeks (5 % allowance for 5-minute session rounding). If the availability cannot hold that, the plan is not built: the engine returns `belowBaselineLong` / `belowBaselineVolume` and the app says what is missing. The only exception is a deliberate return after a pause or injury (resume rules). The floor wins over the goal's long-session cap and over a low difficulty.
- **Quiz**: per selected sport one quick number, the longest session of the last few weeks (km; swims in m). It complements the Strava baseline (the higher value sets the floor) and never replaces it; the user's entry on the summary always wins.
- **Summary shows the start**: the baseline summary shows, per sport, the typical long session with its distance, the weekly volume of the last four weeks and the floors the plan starts from – each editable.
- **Grade-adjusted**: paces are corrected for gradient with the model from "Terrain intelligence", so hilly training does not make the user look slower than they are.
- **Repeatable**: "Recalibrate from recent activities" in Profile → Training zones runs the same flow later. It stays reference-only every time.
- **Strava rules apply**: used for this user's own plan only, never shown to anyone else, never used for AI training. Disconnecting Strava or deleting the account removes the baseline data too.

## Terrain intelligence (core USP)
**User flow for a session:** open today's workout → app shows 3 route options from the user's start point (home or current location): (a) the user's own routes, (b) app-generated round trips, (c) "free session" (time + HR only) → user picks one → map, elevation profile, expected duration and per-km pace plan → "send to watch" (route + structured workout) → after the activity syncs back, grade-adjusted evaluation.

1. **Terrain profile**: home terrain from the quiz (flat / rolling / hilly / mountainous); after Strava is connected, learn the real profile from recent activities (avg elevation gain per km, typical climbs).
2. **Route sources**:
   - Own library: GPX import (share sheet – this is also the Komoot path, since Komoot has no open API), **Strava routes** via the Routes endpoints (no partner programme needed), and **routes recognised from the user's past Strava activities** (cluster similar tracks, keep start point, distance, elevation profile).
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
- **Active energy**: from completed workouts (Strava/Health data) or, if missing, estimated from planned workouts (duration, zone, body weight). Count device-reported active energy with a correction factor (default 0.75, configurable) because wearables tend to overestimate. Steps are the everyday-movement estimate when no wearable day total exists.
- **Energy balance**: intake − (resting + active). Fat estimate 7,700 kcal per kg, shown as an estimate. Counted on complete days only. Body shows it per week (with the goal's planned figure = −deficit × counted days), as a sum **since the goal started** (versions of the same goal count as one; up to a year back) against the plan ("… kcal ahead of your plan" – the 50 % training buffer shows up here), and **day by day** for the last 14 days (eaten, burnt, balance; days not counted labelled). Engine `weeklyEnergyBars`, `balanceSince`, `dailyEnergyBalances`.
- **Weight trend**: exponentially smoothed trend line; day-to-day scale changes are labelled as water/glycogen noise.
- **Body composition** (optional): body fat %, body measurements (waist, hips, chest, arms, thighs …) with measurement instructions, progress photos (stored privately).
- **Safety (mandatory)**: max target loss rate 1 % of body weight per week; intake target never below max(BMR, 1,500 kcal men / 1,200 kcal women) – BMR from the formula, never a device value – never clamped silently: if the chosen rate would push the daily target below it, say so and propose the fastest rate that keeps it (the user accepts it); no "rewards" for very low intake; protein target 1.6–2.2 g/kg during weight loss. Users under 18 cannot use the weight-loss goal. Health disclaimer in onboarding.

## Integrations – constraints to respect
- **Strava**: OAuth via Edge Function. Import runs, rides and swims. Use activities only to adapt *that user's* plan. Never show one user's Strava data to others, never use it to train AI/ML models (Strava API Agreement, Nov 2024).
- **Automatic activity sync (required)**: once an account is connected, every newly recorded activity appears in the app **automatically, without the user opening anything**.
  - Strava: **Strava Webhook Events API** (push subscription) → Supabase Edge Function → fetch activity details → store in Postgres → app receives it via Supabase Realtime (foreground) or a push notification (background) and syncs into SQLite. Also handle activity `update` and `delete` events and athlete deauthorisation.
  - Garmin: **Garmin Activity API** push/ping notifications (Starter tier, see below) → same pipeline. The Personal tier is pull-only, so with a personal key the app polls instead. Strava and Health Connect / HealthKit remain fallback sources.
  - **Deduplication**: the same workout can arrive from Garmin, Strava and Health data. Treat activities as the same if sport matches and start times differ by ≤ 5 min and durations by ≤ 10 %; keep one record with a source priority (watch provider > Strava > Health data) and remember all source IDs.
  - After import: match to the planned workout with a **confidence score** from sport (required; winter variants and bricks count), date (same day 1, next/previous day 0.5), duration and planned distance (full within ±15 %, zero at ±75 %; commute to commute). Confident (≥ 0.75 and 0.15 ahead of the next candidate) → link automatically, mark it done and show a short notice with **Undo** ("Run synced from Strava – Thursday's session marked as done"). Not confident (≥ 0.4) → ask "Which session was this?" with the plausible candidates plus "none of these". Below that – or "none of these" – the activity is **never attached to the nearest workout**: it counts as unplanned towards the week's load (rebalance) and the planned workout stays open. Thresholds in `planConfig.activities.match`.
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
- **Garmin** (the programme was restructured in October 2026 – verify the current terms before relying on this):
  - **Personal tier**: free, self-service. The user creates a personal API key in Garmin Connect Web and exchanges it for an access token. **Pull-only** and limited to that one person's own **Activity, Health and Women's Health** data; no Training or Courses push, and Garmin strips some proprietary fields. Good for development and early testers; before offering "paste your personal key" to users, read the Personal API terms – they are written for a single person's own use and may not cover a third-party app.
  - **Starter tier**: free, for up to **1,000 users**, self-service application, approval reported as near-instant. Adds the **Training API** (push structured workouts) and the **Courses API** (push routes) on top of Activity and Health. **This is the tier Peakr ships on.**
  - **Enterprise tier**: beyond 1,000 users, paid from April 2027, negotiated per company, adds historical backfill and support. Plan for the move before the user count gets close.
  - File export (.FIT workouts + GPX courses) stays as the universal fallback for every brand.
- **Komoot**: official API is **partner-only** (contract required), so the shipping path is **GPX export from the Komoot app shared into Peakr**, not an integration. Keep a KomootClient interface + feature flag for a later partnership. **No scraping.**
- **Strava routes**: the Routes endpoints (list the athlete's routes, export as GPX/TCX) work with an ordinary Strava API app and `read_all`. This is the automatic route import.
- **Garmin Courses API**: publishes courses **to** Garmin Connect; it does not read the user's existing courses. It is therefore a way to get Peakr routes onto the watch, not a way to import Komoot routes. Part of the Starter tier.
- **Garmin Health API**: the data behind the Health tab (see "Health"). Available on the Personal tier for one's own data and on the Starter tier for all users of the app.
- **Migrating from another gym app**: the path that ships is the **CSV/file export** those apps give their own users, imported with the mapping UI in the Gym area – no paid subscription on the user's side to get their own history out. An optional API connection (e.g. a personal API key behind a paid tier) stays behind a feature flag and is never the only way in. See WORKOUTS.md §8.7.
- **Food database**: **Open Food Facts** for barcode lookup (free, ODbL – show attribution, cache results, let users correct entries). Users can create custom foods and recipes.
- **Health Connect / HealthKit**: read weight, body fat, steps, resting and active energy, nutrition and workouts; write nutrition and workouts where allowed. Request only the permissions actually needed. The Body add-on asks for its record types separately and only while the add-on is active; those values stay on the device.

## Monetisation
- **Free without subscription**: on the **website** the calculators ("Tools"), the full quiz and the forecast with the week-1 preview; in the **app** only the quiz, the forecast and that same week-1 preview. There is **no free tier and no free tools inside the app** – after the forecast the paywall is the only way forward.
- **Two tiers** (one subscription group, so users can switch):
  - **Training** (target ~7.90/month or ~59/year): full plan, calendar editing, regeneration, pause, routes, integrations, exports.
  - **Peakr + Body** bundle (entitlement `plus`, formerly "Training + Nutrition"; target ~11.90/month or ~89/year): Training plus the Body add-on at a discount against buying both. Its products also grant `training` and `body_nutrition`. Shown as "coming soon" while the remote flag `addon_body_nutrition` is off.
- **Body add-on** (entitlement `body_nutrition`, proposed ~4.90/month or ~39/year – see docs/body-addon-setup.md): nutrition & body (see "Add-on rules"), bought on top of a tier. Own subscription group / Play product like Gym. **14-day free trial, once per account** (server table `addon_trials`). Ships hidden behind the remote flag `addon_body_nutrition` (Supabase `feature_flags`).
- **Gym add-on** (entitlement `gym`, target ~3.90/month or ~29/year): the strength workspace described under "Gym". It is an **add-on, not a tier** – it can be bought alongside either tier, and also on its own by someone who only wants gym tracking. Because a store subscription group allows only one active subscription at a time, the add-on lives in its **own subscription group** on iOS and as its own product on Google Play. Same 7-day trial rules.
- **7-day free trial**: the user **starts the subscription right after the forecast** and enters payment details upfront (Google Play / App Store / Stripe). Nothing is charged for 7 days; the paywall states the exact first charge date. **One day before the trial ends** the app sends a reminder (push + email) with the charge date, amount and a direct link to cancel. One trial per user/account.
- Paywall appears **after** the quiz and forecast, on the web (Stripe) and in the app (in-app purchase). Entitlements handled via RevenueCat (`training`, `plus`, `gym`, `body_nutrition`) regardless of where the user paid.
- **Manage subscription in the app** (Profile → Subscription): see current tier, price, next billing date and trial status; **upgrade/downgrade** between Training and Peakr + Body and switch monthly/yearly (via the store's subscription change flow; web subscribers via the Stripe customer portal); **cancel easily** without deleting the account (deep link to the store's cancel screen for app purchases, Stripe portal for web purchases). After cancelling, access stays until the end of the paid period; afterwards the user keeps the account, history and free tools, the plan becomes read-only.

## Account & notifications
- **Log out** and **delete account** in Settings → Account. Deletion: confirmation step (type "DELETE" or confirm twice), explains that an active subscription must be cancelled separately in the store (with link) and that all data is removed; deletes all user data in Supabase (incl. storage, integration tokens, revoking Strava/Garmin access) within the store's required timeframe; also offered on the website (Google Play requires a web deletion link).
- **Daily workout reminder**: **one** push notification per day, sent in the morning (default 07:00 local, user can change or turn off), only on days with a planned workout, naming the workout (e.g. "Today: Easy run, 50 min, Zone 2"). No time-of-day for the workout, no further pushes that day. Weather hints are merged into this same notification when relevant (e.g. "…rain expected this evening, indoor option available"), never a second push.
- **Trial ending reminder**: one push + email one day before the trial converts (see Monetisation).
- **Congratulation after a session**: its own notification category (own Android channel), separate from the daily reminder, which stays the only reminder of the day. Sent when a synced activity is **linked to a planned session with confidence** (automatic link); never while the match is unconfirmed ("Which session was this?"), never for a session already marked done by hand, never for activities older than yesterday (first sync). At most **one per session**. In the foreground nothing is shown – the in-app notice says it. On by default, switchable in Settings → Notifications (stored on the device). Tapping it opens the session. Text names the session and day ("Nice work – Long run on Thursday is done – 14.2 km."), never praise for extremes.
- Other notifications (activity synced) are in-app only, not push, unless the user enables them.

## Localisation
- Ship **English first**. All user-facing text via i18next keys from day one (no hard-coded strings). Prepare for de, fr, it, es. Units: metric default, imperial optional.

## Platform strategy
- **Android first**: build, test and release on Android first. iOS follows from the **same codebase**.
- Stay iOS-compatible from day one: only use libraries that support both platforms; put unavoidable platform code behind one interface with `.android.ts` / `.ios.ts` files (e.g. health data); no Android-only UI patterns.
- iOS-specific items for later: HealthKit, Sign in with Apple, App Store products in RevenueCat, App Store review.

## Branding & design tokens
All colours, spacing, radii, font sizes, zone colours and workout-type colours come from **/packages/theme**. No hex values anywhere else in code (`pnpm lint` runs `scripts/check-hex-colors.mjs`). The web maps the tokens in `tailwind.config.ts` (classes like `bg-surface`, `text-muted`) and transpiles the package (`transpilePackages` in `next.config.ts`, otherwise the Vercel build breaks); the app imports them into `src/ui/theme`.

**Palette "Volt"**
```
volt #D4FF3A · voltPressed #BFE81F · ink #0B0D10 · white #FFFFFF
dark:  bg #0B0D10, surface #14171C, surface2 #1C2027, border #2A2F38, text #FFFFFF, textMuted #9AA3AE, accent #D4FF3A, onAccent #0B0D10
light: bg #FFFFFF, surface #F4F6EC, surface2 #E9ECDF, border #DADFCE, text #0B0D10, textMuted #5A6270, accent #D4FF3A, onAccent #0B0D10
status: error #FF5A4E, warning #FFB020, info #5B8CFF (fills/icons; text on light backgrounds uses the darker *Text tokens)
```
- **The app is dark by default**; light mode is optional (user setting). Web pages may be light, but header and hero are dark with Volt.
- Primary button: Volt fill, Ink text, radius 14, min height 48. Secondary: transparent, 1.5 border in `border`, text in `text`.
- Volt sparingly: one primary accent per screen. No gradients, no glows. Volt is never a line or text on light backgrounds (`accentLine` is Ink there).
- **Heart-rate zones** and **workout types** are their own colour scales in the theme (see "UI patterns"); steps differ in hue and lightness, never rely on colour alone.
- **Change** (favourable / unfavourable / neutral) and **chart series** (resting, active, intake, trend, target) are their own scales too, per scheme, with tests for 4.5:1 on bg, surface and surface2, and for distance from Volt and from each other.
- Text contrast at least 4.5:1 (unit-tested in /packages/theme).

**Logo "Pulse Peak"** – a heart-rate line whose spike forms a mountain peak. Exact geometry, never change, never rebuild as outline, never distort; stroke always 10/120 of the size:
`<polyline points="6,82 30,82 38,70 45,92 60,22 75,92 82,70 90,82 114,82" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>` in viewBox 0 0 120 120. Web: inline SVG with `currentColor`; app: `react-native-svg` with a `color` prop.
- Wordmark "peakr", always lowercase: Archivo 800, width 112 %, tracking −0.03em. Static instance `packages/theme/fonts/Peakr-Display.ttf` (generated by `packages/theme/scripts/make-display-font.py` with fontTools `varLib.instancer`), used in app and web (`next/font/local`); also exported as outlined paths (`packages/theme/assets/wordmark.svg`).
- Lockup: mark left, wordmark right, vertically centred; proportions mark 64 / font size 50 / gap 14, scaled together.
- Components with the same API in app and web: `<PeakrMark size color />`, `<PeakrWordmark height color />`, `<PeakrLogo variant="lockup|mark|wordmark" tone="onLight|onDark" />`.
- Colours: on Ink → mark Volt, wordmark white. On light → mark and wordmark Ink. On a Volt surface → mark Ink.
- App icon, adaptive/monochrome icon, splash, favicons, PWA icons and OG image are generated by `pnpm brand:assets` – never edit them by hand. theme-color `#0B0D10`.

**Typography**
- Archivo for headlines and UI (SIL Open Font License, `packages/theme/fonts/OFL.txt`, listed in the app's third-party notices).
- Headlines: Peakr-Display (800, width 112 %), tracking −0.02em. Body: Archivo 400–500, width 100 %.
- Numbers in training data: `tabular-nums`.
- Type scale: 12 / 14 / 16 / 20 / 24 / 32 / 44.

## Gym (strength add-on)
A full gym-logging workspace inside Peakr, good enough that a user cancels their separate gym-tracking app. Its own tab, its own data model, its own entitlement (`gym`).

- **What it is**: exercise library, routine builder, a live session screen (log every set with weight, reps and RPE, rest timer, supersets, plate calculator), full history, personal records and volume statistics per exercise and per muscle group.
- **Relationship to the plan**: planned strength sessions from the training engine open directly into a Gym session, pre-filled with the prescribed exercises. Users without the add-on still see the planned session and can mark it done with duration and effort – they just cannot log sets, keep history or see statistics. The endurance plan never depends on the add-on.
- **Free-standing use**: the Gym area works on its own, without an endurance plan, so a pure strength user is a valid customer. Completed gym sessions still feed the unified load model (CLAUDE.md "Training engine rules") when a plan exists.
- **Offline first**: gyms have poor reception. A session is fully usable offline and syncs afterwards; nothing is lost if the app is killed mid-session.
- **Sharing**: a finished session can be posted to Strava as a real weight-training activity with its sets, not as a generic workout (see "Integrations"), and written to Health Connect / HealthKit.
- **Own work only**: the exercise library, its descriptions and all illustrations are our own or come from a source whose licence we have checked. No content, database or interface is copied from another gym app.

## Health (body & recovery data)
Peakr shows the body data the watch already records, so the user does not need the manufacturer's own app beside Peakr. The data comes from the **Garmin Health API** and, as a second source, **Health Connect / HealthKit**.

- **What it shows**: sleep (duration, stages, and a score where the API provides one), overnight HRV, resting heart rate, stress, steps, floors, intensity minutes, calories, SpO2, respiration, body composition from a connected scale, and VO2max. Whatever else the Health API exposes is added only after checking the current Swagger docs – proprietary metrics such as Body Battery or Training Readiness may not be available, and nothing is invented or recalculated to look like them.
- **Where**: in the **Body** tab, under the goal (see "UI patterns → Body").
- **Layout**: one overview with today's values as tiles, each opening a detail view with 7-day, 30-day and 12-month charts, a personal baseline band and the trend. Numbers are shown with their recording time and their source.
- **Read against training, not in isolation**: a hard session appears on the sleep and HRV charts; the day's workout card shows a short recovery line ("Resting HR 6 bpm above your baseline") when a value is clearly outside the user's own range.
- **No diagnosis, ever**: Peakr describes what was measured and how it compares to the user's own baseline. It never interprets a value medically, never names a condition, and never tells someone they are ill. Anything unusual is paired with "if this persists, talk to a doctor", not with an explanation.
- **Nothing changes automatically**: recovery data may *suggest* an easier day, with a reason and a one-tap accept. The plan is never rewritten behind the user's back. (The full readiness check is a later feature.)
- **Consent and privacy**: health data is sensitive. Each data group is opted into separately, the user sees exactly what is read, can turn a group off, and can delete all health data without deleting the account. It is stored encrypted, never shown to anyone else, and never used to train models. Women's health data is off unless explicitly enabled.
- **Tier**: part of the base **Training** subscription, not a separate add-on. It is a reason to stay, not a reason to pay twice.

## Growth & SEO (website)
- The **website is the main acquisition channel**, the app stores are secondary. Every page has one job and one call to action into the quiz.
- Search intents to own: the free calculators (heart-rate zones, Zone 2, pace, swim CSS), plans by goal (5k, 10k, half, marathon, triathlon, lose weight, cycling), and the differentiators (hybrid training, terrain/elevation, training + nutrition).
- Technical baseline on every page: one canonical URL, unique title and description, structured data where it applies, an Open Graph image, and good Core Web Vitals. Locales (de, fr, it, es) get `hreflang` only once actually translated.
- **Consent first**: no analytics or ad script loads before the visitor has consented (GDPR and revDSG). Nothing about the product depends on tracking.
- **Attribution is stored server-side**: UTM parameters, `gclid` and referrer are captured on the first visit, carried through the anonymous quiz session and written onto the user and the subscription. Conversions (trial started, trial converted) are reported from the Stripe and RevenueCat webhooks, not from the browser.
- One shared **event schema** for web and app: `quiz_start`, `quiz_step`, `quiz_complete`, `forecast_view`, `paywall_view`, `checkout_start`, `trial_start`, `trial_convert`, `app_open_first`.
- App store listing optimisation (title, subtitle, keywords, screenshots) is handled in the store, not here.

## UI patterns (app)
These are the conventions every screen follows. They are patterns common to training apps, implemented in **our own** visual language (Volt palette, Archivo, Peakr logo) – never a copy of another app's layout, icons, illustrations, gradients or wording.

- **Navigation**: five bottom tabs – **Today, Plan, Gym, Nutrition, Body** – always, whatever the remote flag `addon_body_nutrition` says; the flag only decides what Nutrition and the tracking part of Body show (switched off: "coming soon"; on without the add-on: preview and paywall). Five is the hard limit (the Android tab bar cannot hold more). **Profile is not a tab**: a profile icon sits top right on every tab and every stack screen (not in onboarding, auth, paywall, Profile and Settings themselves) and opens Profile. Plan holds three segments – **Weeks**, **Calendar** and **History** (activity history and Records). There is no Insights tab or screen; old links go to Plan → History.
- **Profile vs. Settings**: **Profile** is about the person and the plan – personal data, training zones, terrain; the goal and plan group (Create a new plan, Plan history, availability, difficulty, pause, strength, commutes, travel, winter, weather, routes, workout types); Strava & watch connections; subscription. **Settings** is about the app – notifications, units, appearance, language, haptics, privacy, account (log out, delete), licences. Each links to the other.
- **Workout type colours**: every workout type owns a colour token (easy/recovery, long, tempo/threshold, intervals/VO2, hills, race/test, strength, cross-training/winter, commute). It appears as a bar on the left edge of every workout card, as the dot under a day in the week strip, and as the tint of the workout screen header. The tokens must be distinguishable in hue **and** lightness, must not be confusable with the brand accent (Volt is reserved for primary actions), and colour never carries meaning alone – the type is always named in text too.
- **Today shows one day**: the week strip Mon–Sun is the **day switcher** – tapping a day selects it and never navigates away; the selected day is filled, today has a ring, arrows change the week, and a "Back to today" button appears as soon as another day is selected. The dots under the days are in the workout type colours, and a line under the strip names the types of the selected day in words. The selected day's session is shown in full: type and title in the type colour, duration as a range, the bpm band ("Easy · 139–159 bpm (Zone 2)"), the chosen route (name, km, gain) or "free session", the numbered steps, "why this session", mark as done and open. A day without a session gets a rest-day card that names the next session. Weather chip, commute card and "Which session was this?" questions stay. The week is **at most one small line** (time done/planned plus the per-sport volume); no insight cards on Today.
- **Plan**: one card per week – date range, "Week 3 of 12", a tick when the week is complete, a segmented bar with one segment per session, sessions done/planned, the **weekly volume** and a tag when the week is special (recovery, travel, race week).
- **Weekly volume per sport**: distances are never added up across sports. **Time** is the one figure across sports ("3 h 10 / 5 h 20"); below it one line per selected sport in its sport colour, done/planned – run and ride in km (mi), swims in m (yd, in 50 steps), strength in sessions; commutes are not listed. With only one endurance sport just its distance is shown. Same in the Plan week cards, the calendar week sections and the Today week line (engine `weekProgress.bySport`).
- **Plan → Calendar view**: weeks as sections with the week's volume (time + per sport); one row per day; empty days offer "add"; sessions as compact chips with the type colour; "reset week" undoes manual changes.
- **Gym**: the strength workspace (see "Gym"). Without the add-on the tab shows a preview and the paywall, never a hidden icon.
- **Workout detail**: header tinted in the type colour with week, date, title and subtitle; **duration as a range** (e.g. 30–35 min); a line showing when it was last sent to the watch; a row of quick actions (choose route, link activity, warm-up, skip); outdoor/indoor toggle; numbered steps, each with its target and one line of explanation; the "why this session" text; one primary CTA. For easy sessions the pace is phrased as a **limit, not a target** ("no faster than …"), with HR as the real target.
- **Workout types** (Profile → Workout types): one collapsed row per type – icon, name, one line and a zone/effort chip ("Z1–2 · 3–4/10"); a tap expands how it is done and what it is for (no copy repeated between the line and the description). Grouped by sport in collapsible sections with a sport filter; the user's own sports by default, "Show all sports" for the rest. A workout links to its type, opened and expanded.
- **Strava routes**: a recognised route row opens a preview – map, elevation profile, distance, gain, how often and when last done, typical duration – with an editable name (suggested from the start point: "Home loop 5.5 km" within 300 m of the home start, else the place from the system geocoder) and "Add". GPS fragments below a minimum distance per sport (`planConfig.routes.recognition.minDistanceM`) are not suggested.
- **Body** (tab): from top to bottom – the **goal** with its progress bar; **Health** (today's values as tiles – sleep, HRV, resting HR, stress, steps, … – each opening 7-day, 30-day and 12-month charts against the user's own baseline band, see "Health"); then, with the Body add-on, **weight & body**: KPI tiles, trend chart, energy balance, composition and indices, **measurements as a table** (label, current value right-aligned, change in its own right-aligned column with sign and change colour), progress photos and check-in.
- **Tiles**: a wrapping two-column grid (`TileGrid`), one column below 360 dp or with a font scale above 1.3; nothing is clipped or cut to one line. Anatomy: label small in capitals, the value large, one context line ("▼ 0.6 kg · last 7 days").
- **Change colours**: a change is coloured favourable / unfavourable / neutral from the theme's change scale (`changeFavourable`, `changeUnfavourable`, `changeNeutral`). Whether a change is favourable depends on the **metric and the goal** (engine `changeTone`: losing → weight and trunk girths down; gaining → weight, chest and arms up; maintaining → near zero; body fat down, lean mass, HRV and sleep up, resting HR down always); below a noise threshold it is neutral. Colour never carries the meaning alone – the arrow or sign and the words do. Volt is not "good".
- **Nutrition** (tab): the food diary with "Energy today", the energy targets and the **weekly coach**. The coach is a card with a row of last week's figures (weight trend, logged days, intake, sessions), at most **three one-line takeaways** with icon and tone (good sign / keep an eye on), and the adjustments and hints folded away behind one toggle. A week with too little data (`coach.dataState: 'thin'`) gets one sentence and one helpful action ("Log what you eat on three days this week …" · Log a meal) – no percentages, no empty bars, no counting of what is missing. Gentle wording, never "only 0 days".
- **Charts**: series use the theme chart colours (`chartResting`, `chartActive`, `chartIntake`, `chartTrend`, `chartTarget`) and every chart has a legend with swatch and word; each chart sits in a card with a heading. Text contrast ≥ 4.5:1 in dark and light.
- **Plan → History**: activities grouped by month with month totals (route thumbnail, distance, time, average pace, type colour) and **Records** (period picker, summary figures, a bar chart per week with an average line, badges for completed plans, personal bests, lifetime totals) as an inner Sessions / Records switch. With an archived plan both get a labelled "This plan / All time" switch (bests and lifetime always all time).
- **Profile**: grouped rows with icons as listed under "Profile vs. Settings". The goal and plan group starts with **Create a new plan** (showing the current goal) and **Plan history** (archived plans with outcome and completion, read-only details, badges, JSON export, same-day undo).
- **General**: training numbers in tabular figures; haptic feedback when a session is completed; dark theme by default.

## Conventions
- Engine code (`/packages/engine`) is pure TypeScript, deterministic, and every rule above has unit tests.
- Small, reviewable steps; run `pnpm lint && pnpm typecheck && pnpm test` before saying a step is done.
- Ask before: adding a paid service, changing the stack, or changing a rule in this file.

## Working mode (Claude)
The user hands over tasks one after another and expects them to be worked off whenever the usage limit allows, without restating this each time.
- **GitHub is the main path.** `@claude` in an issue or PR runs `.github/workflows/claude.yml` and labels the item `claude-queue`. If a run stops early (usage limit), `.github/workflows/claude-resume.yml` takes the oldest labelled item every hour and continues it. Remove the label when the task is complete or needs the user's decision; leave it while work remains.
- **In a chat session**: every new prompt goes into `.claude/queue.md` under "Open"; while anything is open the hourly check-in (scheduled task, ID in that file) is enabled, and disabled when the queue is empty. Recreate it if it is missing.
- Always: commit and push in small steps so nothing is lost when the limit stops a run, and only report back when a task is done, blocked, or needs a decision.

  ## Add-on rules
- Nutrition & body is an add-on inside Peakr, never a separate app or module with its own navigation, onboarding or design
- Gating only via the entitlement "body_nutrition" and the central guard; checked client-side for UI and server-side for data
- Teil A features must never depend on the add-on; the add-on may read training data from Teil A
- Locked states show previews and a paywall entry point, never empty or broken screens
- Cancelled add-on: keep the data, allow export, lock new entries

## Energy & body rules
- All energy and body math lives in /packages/engine, never in UI code
- Calculations use the smoothed trend weight, never single weigh-ins
- Every estimate (body fat via Navy, fat/lean mass, adaptive TDEE, workout energy) is labelled as an estimate in the UI
- Data priority when sources overlap: manual entry > device/Health data > estimate. Per value and day (engine `pickBySource`):
  - **Weight, body fat**: check-in > Garmin (scale via Garmin Connect) > Health Connect / HealthKit.
  - **Intake**: Peakr diary (any entry that day) > Health Connect / HealthKit nutrition. Nutrition never comes from Garmin.
  - **Resting energy**: Garmin (`bmrKilocalories`) > Health Connect / HealthKit > formula (Katch-McArdle with a body fat % of the last 30 days, else Mifflin-St Jeor).
  - **Active energy** (the day's energy *model*, what was burnt): a wearable's whole-day total (Garmin > Health Connect / HealthKit) × correction (0.75); otherwise workouts (health-store workout energy × correction > completed activities estimated from heart rate or MET > planned sessions) plus everyday movement (steps > default share of BMR).
- **The target** (what to eat) is built, not measured, and stays stable:
  - **Base** (a day without sport): with a wearable, what it measured on the last 14 days without a workout (resting + active, the active part at 50 %; at least 3 such days, `energyConfig.goal.wearableBaseMinDays`); otherwise resting energy × the **everyday-activity factor**: home office 1.2, desk job 1.3, moderately active 1.45, on your feet all day 1.6 – asked once before the first goal, editable in Body → Energy targets (desk job until answered). The adaptive TDEE corrects it.
  - **Training and the fixed daily target**: the target is the **same every day** of the week (like a watch's daily goal) = base + the week's planned training ÷ 7 − deficit, with planned training counted at **50 %** (`energyConfig.goal.activeShare`; the other half is a buffer, so keeping to the target and training as planned loses a little more than the planned deficit). Fixed on Monday with the plan; synced sessions do not rewrite it; when actual training so far is clearly off the plan (±25 % and ≥ 200 kcal) a hint is shown instead. No eat-back.
  - **Macros are derived, never fixed**: protein 1.9 g/kg (configurable 1.6–2.2), fat 0.9 g/kg (0.8–1.0, never below 0.6 g/kg), carbohydrates = the remaining energy of the daily target (80 kg at ~2,250 kcal ≈ 152 g / 72 g / 249 g). Trend weight.
  - The app shows how the daily target is built: resting energy, everyday activity (from the watch or the factor), this week's training per day (50 %), deficit.
  - **Steps**: Garmin > Health Connect / HealthKit.
- **Recipes** (engine `recipeSummary`, `recipeServing`, `scaleRecipe`, `relogEntry`): ingredients are added the same ways as a single food (search, barcode – the same scanner –, recents, favourites, by hand) with their unit (g, ml, piece, portion; stored in the basis unit, ml counted as g for the raw weight). The whole dish is the sum; a portion is total ÷ portions. With the **cooked weight** a portion can also be logged by weight (1,200 g in 4 portions = 300 g; 380 g eaten = 380/1,200 of the dish); without it only portions. Scaling multiplies ingredients, cooked weight and portions – a portion stays the same. Logged entries are **snapshots**: editing a recipe never rewrites them silently – if an edit changes what a portion holds and the recipe was logged, the app asks, default "keep logged days as they are"; deleting a recipe keeps its entries. Leftovers are the same recipe logged again. Open Food Facts attribution applies to OFF ingredients; entries go to Health Connect / HealthKit like any entry.
- Days marked "incomplete" are excluded from adaptive TDEE and "calculation vs. scale"
- Progress photos: private storage only, signed URLs, RLS per user

## Weight goal rules
- Safety rules (max rate, intake floor, BMI limits, under-18 block, too-fast-loss warning) are enforced in the engine and cannot be overridden by settings
- Max loss rate: 1 % of body weight per week, absolute cap 1.0 kg/week
- Intake floor: max(BMR, 1,200 kcal women / 1,500 kcal men), BMR from Mifflin-St Jeor / Katch-McArdle (never a device value) – checked on the fixed daily target with the planned training at 50 % (the lowest planned week of the next four, so it holds in a recovery week; without a plan, a day without sport); never a silent clamp: the engine returns `belowFloor` with the fastest rate in 0.05 kg steps that keeps it, and the goal can only be saved at that rate
- No loss goal if current BMI < 18.5 or the target weight results in BMI < 18.5
- Under-18: only "maintain" allowed
- Too-fast-loss warning: trend loss above 1.5 % of body weight per week, two weeks in a row → gentle warning and the suggestion to eat more
- Rate presets: losing 0.25 / 0.5 / 0.75 / 1.0 kg/week, gaining 0.1 / 0.25 / 0.5 kg/week (custom in 0.05 steps); presets above the max rate are shown disabled with the reason
- Weekly check-in suggestions change the daily target by at most ±150 kcal per week; the user accepts them, nothing changes automatically
- Every target change stores its reason (user, adaptive recalculation, safety clamp)
- Wording: gentle, non-judgmental, no shame language, no streak pressure for weighing, never praise extreme deficits or very fast loss
