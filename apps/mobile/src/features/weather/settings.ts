import { planConfig } from '@peakr/engine';

/**
 * Weather check settings (Profile → Weather check). Off until the user turns it on – only then is
 * the location permission asked for, and only for "current location"; the home start point from
 * the Terrain profile is the fallback.
 */

export type WeatherLocationSource = 'current' | 'home';

export interface WeatherSettings {
  enabled: boolean;
  source: WeatherLocationSource;
  /** Local hour the user usually trains – the plan has no time of day. */
  sessionHour: number;
}

export const DEFAULT_WEATHER_SETTINGS: WeatherSettings = {
  enabled: false,
  source: 'current',
  sessionHour: planConfig.weather.defaultSessionHour,
};

const hour = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23 ? v : fallback;

/** Stored JSON → settings; unknown or broken values fall back to the defaults. */
export function parseWeatherSettings(raw: unknown): WeatherSettings {
  const d = DEFAULT_WEATHER_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Partial<Record<keyof WeatherSettings, unknown>>;
  return {
    enabled: r.enabled === true,
    source: r.source === 'home' ? 'home' : 'current',
    sessionHour: hour(r.sessionHour, d.sessionHour),
  };
}
