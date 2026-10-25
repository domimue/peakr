# Phase 10c – Account, notifications & hard-day rule

Prompt: engine hard/easy classification, no hard days back to back (downgrade with a reason, move
warning with "make the other day easier" / "keep it anyway"); Profile → Account (log out, delete
account with confirmation, subscription info, full deletion incl. storage and integration tokens
via an Edge Function, web deletion request page); daily workout reminder (one push per morning,
default 07:00 local, configurable/off, only on workout days, names the workout, weather merged,
never more than one, Expo notifications + scheduled Edge Function, time zones); settings screens
as grouped rows (notifications, units, appearance, haptics, language, privacy).

## Already there from earlier phases

- Engine: `classify.ts` (hard on its own, beginner `moderate`), scheduler downgrade with
  `notes.downgraded`, `moveWorkout` warnings with `easeable` + the move-feedback UI.
- Account screen (sign out, delete with typed DELETE, store link), `delete-account` function,
  web `/delete-account` page (in-app steps + email).
- Weather morning notification (local, from the on-device forecast).

## Decisions

- **Reminder on the server**: `notification_settings` (one row per user: enabled, local time,
  time zone, weather line) + `daily_reminders` (user, local date – primary key, so never two a
  day). pg_cron runs `daily-reminders` every 15 min; it picks users whose local time passed the
  reminder time today, today's planned workouts from `workouts`, and sends one Expo push.
- **Weather stays on the device**: the location never leaves it. The app uploads only the hint
  for a day (`reminder_hints`: date, reason key, hour, option) and the server merges it into the
  same push. The local morning weather notification is retired.
- **Texts on the server**: English for now, built from the same `@peakr/i18n` keys the app uses
  where possible; `profiles.locale` picks the language later.
- **Settings**: one persisted store (`app_settings` key `app.settings`): theme, units, haptics,
  language. Units: metric default; imperial switches the distance/pace formatters.
- **Deletion**: storage objects under `<userId>/` in every bucket are removed; every integration
  (Strava, Garmin, COROS, Suunto, Zwift) gets a best-effort revoke; newer tables added. The web
  page gets a request form (signed-in: delete directly; otherwise a request by email that is
  confirmed via magic link).

## Steps

- [x] Engine: grid test "never hard on consecutive days", generator downgrade test
- [x] Deletion: storage, all providers, missing tables; web deletion page (`/account/delete`)
- [x] Reminder: migration, `daily-reminders` Edge Function + tests, cron
- [x] App: notification settings screen, time zone upload, weather hint upload, retire local alert
- [x] App: settings store persisted; units, haptics, language, privacy, appearance screens
- [ ] Docs + lint/typecheck/test
