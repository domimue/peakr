/**
 * Hourly forecast for one location as the `weather` Edge Function returns it (any
 * `WeatherProvider`). Times are local wall-clock times of the location (`2026-10-20T18:00`), so
 * they compare directly with plan dates and the user's session hour.
 */

export type WeatherProviderId = 'meteoswiss' | 'openmeteo';

export interface WeatherHour {
  /** Local time of the hour's start, `YYYY-MM-DDTHH:00`. */
  time: string;
  temperatureC: number | null;
  /** Rain + showers + snow (water equivalent) in this hour, mm. */
  precipitationMm: number | null;
  /** Fresh snow in this hour, cm. */
  snowfallCm: number | null;
  windGustKmh: number | null;
  /** WMO weather interpretation code. */
  weatherCode: number | null;
}

export interface WeatherForecast {
  provider: WeatherProviderId;
  /** IANA time zone of the location. */
  timezone: string;
  /** ISO timestamp of the provider fetch (the Edge Function caches per location and hour). */
  fetchedAt: string;
  hours: WeatherHour[];
}

/** What the Today chip shows. */
export type WeatherCondition =
  | 'clear'
  | 'partlyCloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'freezingRain'
  | 'thunderstorm';

/** Why a session gets a hint, most severe first. No heat logic (CLAUDE.md). */
export type WeatherReason = 'thunderstorm' | 'ice' | 'storm' | 'snow' | 'heavyRain';

/** Which threshold set a session uses. */
export type WeatherExposure = 'run' | 'bike' | 'swim' | 'winter';

export type WeatherAction = 'indoor' | 'move' | 'skip';

export interface WeatherHint {
  workoutId: string;
  reasons: WeatherReason[];
  /** First affected hour (local, `YYYY-MM-DDTHH:00`). */
  from: string;
  /** Options in the order the card offers them; the user decides, nothing changes on its own. */
  actions: WeatherAction[];
}
