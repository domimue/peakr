import {
  indoorVersion,
  weatherHint,
  type PlanState,
  type UserProfile,
  type WeatherForecast,
  type Workout,
} from '@peakr/engine';
import type { TFunction } from 'i18next';

import { hourText } from './text';

/**
 * The weather line of the daily reminder (CLAUDE.md "Account & notifications": weather hints are
 * merged into the one morning push, never a second one): "Heavy rain from 6:00 PM – Treadmill
 * option available." Computed on the device from the forecast for the user's location; only this
 * text goes to the server, never the location.
 */
export function weatherLine(
  t: TFunction,
  language: string,
  forecast: WeatherForecast,
  state: PlanState,
  w: Workout,
  profile: UserProfile,
  sessionHour: number,
): string | null {
  const hint = weatherHint(forecast, state, w, profile, sessionHour);
  if (!hint) return null;
  const indoor = indoorVersion(w);
  const first = hint.actions[0];
  const option =
    first === 'indoor' && indoor
      ? t('weather.alert.indoor', { kind: t(`workout.indoor.${indoor.kind}`) })
      : first === 'skip'
        ? t('weather.alert.skip')
        : t('weather.alert.move');
  const line = t('weather.alert.body', {
    reason: t(`weather.reason.${hint.reasons[0] ?? 'heavyRain'}.short`),
    time: hourText(hint.from, language),
    option,
  });
  // The reason is lowercase for use inside sentences; the line starts the notification body.
  return line.charAt(0).toLocaleUpperCase(language) + line.slice(1);
}
