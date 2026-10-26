# Body add-on: store, RevenueCat and Supabase setup

Phase 11b. The Body add-on (nutrition & body) runs inside Peakr – no second app, no second
paywall system. This page lists what has to be created outside the repo. Tiers, webhook and trial
reminder are in `docs/subscriptions-setup.md`, the Gym add-on in `docs/gym-addon-setup.md`; the
Body add-on follows the same pattern.

**Prices below are targets, not decided.** CLAUDE.md lists ~11.90/month · ~89/year for the tier
that is now the bundle; the add-on price is a proposal (~4.90/month · ~39/year) so that the bundle
is cheaper than both separately (59 + 39 = 98 > 89 → "Save 9 %"). The app reads the real prices
from the stores and computes the saving from them; nothing is hard-coded.

## What is sold

| Product | Entitlements | Trial | Where |
| --- | --- | --- | --- |
| Body add-on (`peakr_body`) | `body_nutrition` | 14 days, once per account | own subscription group / own Play subscription |
| Bundle "Peakr + Body" (`peakr_plus`, the former "Training + Nutrition" tier) | `training`, `plus`, `body_nutrition` | 7 days (tier trial) | tier subscription group, next to `peakr_training` |

Someone on Training who wants Body can buy the add-on (on top) or switch to the bundle (the
store's tier change flow). The subscription screen points out when someone has both.

## 1. Google Play Console

1. **Subscriptions → Create**: Product ID `peakr_body`, name "Peakr Body".
2. Base plans `monthly` (1 month) and `yearly` (1 year).
3. On each base plan an offer: "New customer acquisition", eligibility **"Never had this
   subscription"**, phase **Free trial, 14 days**. The base plan itself has no free phase – the
   app buys it directly (`purchaseSubscriptionOption`) when the Peakr account already used its
   trial, so a second Google account does not get a second trial.
4. `peakr_plus`: rename to "Peakr + Body" (store listing only – the product id stays).

## 2. App Store Connect

1. New subscription group **"Peakr Body"** (its own group, like Gym – one group allows one active
   subscription).
2. `peakr_body_monthly`, `peakr_body_yearly`, same level; introductory offer **Free, 2 weeks, new
   subscribers**.
3. Rename the `peakr_plus_*` products' display name to "Peakr + Body".
4. Limitation: Apple decides trial eligibility per Apple ID and subscription group. The app shows
   no trial when the Peakr account already used one, but a different Apple ID could still be
   offered one by Apple. Closing that gap needs promotional offers with server-signed eligibility;
   not worth it before the add-on has users.

## 3. RevenueCat

1. **Entitlement** `body_nutrition` (exactly). Attach the four `peakr_body` products **and** all
   `peakr_plus` products (the bundle grants Body). `peakr_plus` stays attached to `training` and
   `plus` as well.
2. **Offering** `body` with packages `$rc_monthly` and `$rc_annual` → `peakr_body` products.
3. Stripe (web, later): product "Peakr Body", monthly/yearly, 14-day trial with card upfront,
   attached to `body_nutrition`; the bundle's Stripe product also gets `body_nutrition`.
4. The webhook needs no change: `revenuecat-webhook` already mirrors every entitlement and now
   also records Body trials in `addon_trials`.

## 4. Supabase

1. Apply the migration `20261103000000_body_addon.sql` (`supabase db push`). It adds:
   - `body_nutrition` to `entitlements`; `has_entitlement` counts `plus` as Body too;
   - `feature_flags` with `addon_body_nutrition = false`;
   - `addon_trials` (one row per account and add-on, never removed);
   - `sex`, `birth_date`, `height_cm`, `weight_kg` on `profiles` (the one shared profile);
   - `body_food_entries`, `body_checkins` – read own rows always, **write only with the
     entitlement and the flag on** (RLS via `can_write_body_addon()`).
2. Redeploy `revenuecat-webhook` and `trial-reminders` (shared billing code changed: new
   entitlement, product names "Peakr + Body" / "Peakr Body").

## 5. Switching it on

The add-on ships hidden. To switch it on for everyone, without a release:

```sql
update public.feature_flags set enabled = true where key = 'addon_body_nutrition';
```

The app reads the flag at start (and keeps the last value for offline starts). Effects when on:

- the tab bar shows **Body** in the fourth slot; **Insights** moves to Profile and Today
  (`/training/insights`) – the bar holds five tabs at most (user decision, 2026-10-26);
- Today shows the "Energy today" card (locked: blurred sample + "Unlock");
- the paywall sells the bundle "Peakr + Body" instead of "coming soon";
- Profile → Subscription shows the Body add-on.

Switching it off again hides all of it; nobody's data is touched. The personal build
(`docs/personal-build.md`) always has the flag on and the add-on unlocked.

## 6. Cancelling and coming back

- Cancelled: everything keeps working until the paid period ends (state `cancelled`).
- Ended (`expired`): diary, check-ins and progress stay readable, "Export my Body data (CSV)"
  works, new entries and edits are locked in the app and refused by the server.
- Buying again (`/body/addon`): everything is still there – nothing was deleted.
- Deleting the account removes all of it (`on delete cascade`).

## 7. Testing

- `pnpm --filter @peakr/mobile test -- body` – guard states (active, trial, cancelled, expired,
  never, flag off, bundle), Body screens, Today/Plan without the add-on.
- `pnpm --filter @peakr/billing test` – webhook rows, add-on trials, bundle reminder.
- `pnpm --filter @peakr/engine test` – energy model.
- RLS was checked against a local Postgres with the migrations applied: no flag / no entitlement
  → insert refused; bundle active → allowed; expired → read allowed, insert and update refused.

## 8. Phase 12 – energy engine and health data

What the add-on reads and from where (the priority is in CLAUDE.md "Energy & body rules"):

- **Health Connect** (Android): weight, body fat, steps, active energy, basal metabolic rate,
  nutrition, exercise sessions with their active calories. Asked for from Body → "Connect Health
  Connect", only while the add-on is active (trial, active or cancelled-but-paid). New manifest
  permissions in `app.json`: `READ_ACTIVE_CALORIES_BURNED`, `READ_BASAL_METABOLIC_RATE`,
  `READ_NUTRITION`, `READ_EXERCISE` – **Play Console → App content → Health apps** needs the
  declaration and a reason for each before the release goes out. Values are kept on the phone
  (`body_device_daily`), never uploaded.
- **HealthKit** (iOS): same interface, still a stub like the rest of HealthKit until the iOS
  release (Android first); the identifiers are listed in `health.ios.ts`.
- **Garmin**: body composition (`bodyComps`: weight, body fat, muscle mass) and daily energy
  (`dailies`: `activeKilocalories`, now also `bmrKilocalories` → `resting_kcal`) through the
  existing health sync – as long as the user switched on the matching groups in Insights →
  Health. Check `bmrKilocalories` against the current Garmin Health API docs together with the
  other fields in `docs/health-garmin.md`. Garmin has no nutrition; intake comes from the diary
  or Health Connect only.

Server: apply `20261104000000_body_energy.sql` (day markers, TDEE estimates, target changes, body
fat in check-ins; same RLS as the other Body tables).

Engine (`packages/engine/src/energy`): resting energy, active energy with the correction factor
(0.8), daily and weekly balance with the fat estimate, the robust weight trend, adaptive TDEE (≥ 14
days, ±100 kcal per week, every estimate stored with its basis), "calculation vs. scale" (complete
weeks only, confidence), fat and lean mass, and the weight goal safety rules. There is no goal
screen yet: targets are "maintain" until the goal setting is built; every target change is
already stored with its reason.

## 9. Phase 13 – weight goal

- Apply `20261105000000_body_goals.sql` (goal versions with their reason; same RLS as the other
  Body tables).
- Engine `packages/engine/src/energy/goal.ts`: presets, targets (adaptive TDEE once available,
  else formula), eat-back (default 50 %), weekly mode, protein by deficit, forecast vs. real pace,
  weekly check-in (±150 kcal), plateau (≥ 21 days flat despite a logged deficit), target reached
  + reverse diet (+100 kcal per week), training interaction (heavy, race and taper weeks; key
  days), rapid-loss warning (> 1.5 %/week two weeks in a row).
- App: Body → Progress → goal card; setup at `/body/goal` (current weight → target → rate with
  presets and slider → summary). Every change, pause or accepted suggestion is a new goal version.
- Reverse diet is suggested, not automatic: after "Switch to maintain" the target starts at the
  old deficit and the card offers "+100 kcal" once a week.

## 10. Phase 14 – food logging

- Apply `20261106000000_body_foods.sql` (macros and portions on diary entries; `body_foods` for
  the Open Food Facts cache, own foods and recipes; same RLS as the other Body tables).
- New native module: `expo-camera` (barcode scan; camera permission text in `app.json`, audio
  recording blocked). A new development build is needed.
- Health Connect: new permission `WRITE_NUTRITION` (diary written as one `Nutrition` record per
  entry, client record id `peakr-food-<id>`). Intake is now read from the records instead of the
  daily aggregate so Peakr's own entries are left out – no double counting. Declare the write
  permission in Play Console → App content → Health apps.
- Open Food Facts: read-only, no key; the app sends `User-Agent: Peakr/1.0 (…)` as OFF asks –
  put the real contact URL/email there before release. Attribution (ODbL) is shown on search,
  scan and product screens; users can correct any entry (saved as their own food, which wins).
- Offline: diary, own foods, recipes and every product scanned before work without network; OFF
  only adds results. Everything syncs later through the normal Body sync.
