/**
 * Weather providers behind one interface (CLAUDE.md "Weather check"): MeteoSwiss open data for
 * Switzerland, Open-Meteo everywhere else. Both deliver the same `WeatherForecast` shape as
 * `@peakr/engine` (`weather/types.ts`): local hourly times, precipitation in mm, snowfall in cm,
 * gusts in km/h, WMO weather codes.
 *
 * MeteoSwiss publishes its ICON-CH1/CH2 forecasts as open government data in GRIB2 files; Open-Meteo
 * serves exactly these models as point forecasts (`models=meteoswiss_icon_seamless`), so the Swiss
 * provider uses that endpoint instead of decoding GRIB in an Edge Function. Licence: Open-Meteo
 * data is CC BY 4.0 (attribution in the app); its free API is non-commercial only – set
 * OPEN_METEO_API_KEY (paid API plan, customer endpoint) before launch.
 */

export type WeatherProviderId = 'meteoswiss' | 'openmeteo';

export interface WeatherHour {
  time: string;
  temperatureC: number | null;
  precipitationMm: number | null;
  snowfallCm: number | null;
  windGustKmh: number | null;
  weatherCode: number | null;
}

export interface WeatherForecast {
  provider: WeatherProviderId;
  timezone: string;
  fetchedAt: string;
  hours: WeatherHour[];
}

export interface WeatherProvider {
  id: WeatherProviderId;
  /** Whether this provider is the right one for the location. */
  covers(lat: number, lon: number): boolean;
  hourly(lat: number, lon: number): Promise<WeatherForecast>;
}

export class WeatherError extends Error {
  constructor(readonly status: number) {
    super(`Weather provider responded ${status}`);
  }
}

/** Yesterday for black ice after rain, then a week for "move to another day". */
const PAST_DAYS = 1;
const FORECAST_DAYS = 7;
const HOURLY = 'temperature_2m,precipitation,snowfall,weather_code,wind_gusts_10m';

interface OpenMeteoResponse {
  timezone?: string;
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    precipitation?: (number | null)[];
    snowfall?: (number | null)[];
    weather_code?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
  };
}

const num = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function mapOpenMeteo(
  provider: WeatherProviderId,
  body: OpenMeteoResponse,
  fetchedAt: string,
): WeatherForecast {
  const h = body.hourly ?? {};
  const hours: WeatherHour[] = (h.time ?? []).map((time, i) => ({
    time,
    temperatureC: num(h.temperature_2m?.[i]),
    precipitationMm: num(h.precipitation?.[i]),
    snowfallCm: num(h.snowfall?.[i]),
    windGustKmh: num(h.wind_gusts_10m?.[i]),
    weatherCode: num(h.weather_code?.[i]),
  }));
  return { provider, timezone: body.timezone ?? 'UTC', fetchedAt, hours };
}

async function openMeteo(
  provider: WeatherProviderId,
  lat: number,
  lon: number,
  model: string | null,
): Promise<WeatherForecast> {
  const key = Deno.env.get('OPEN_METEO_API_KEY');
  const base = key
    ? 'https://customer-api.open-meteo.com/v1/forecast'
    : 'https://api.open-meteo.com/v1/forecast';
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: HOURLY,
    timezone: 'auto',
    past_days: String(PAST_DAYS),
    forecast_days: String(FORECAST_DAYS),
    timeformat: 'iso8601',
  });
  if (model) params.set('models', model);
  if (key) params.set('apikey', key);
  const response = await fetch(`${base}?${params}`);
  if (!response.ok) throw new WeatherError(response.status);
  return mapOpenMeteo(
    provider,
    (await response.json()) as OpenMeteoResponse,
    new Date().toISOString(),
  );
}

/** Switzerland (and Liechtenstein) as a box – the ICON-CH domain reaches well beyond it. */
const SWISS_BOX = { latMin: 45.8, latMax: 47.85, lonMin: 5.9, lonMax: 10.55 };

export const meteoSwiss: WeatherProvider = {
  id: 'meteoswiss',
  covers: (lat, lon) =>
    lat >= SWISS_BOX.latMin &&
    lat <= SWISS_BOX.latMax &&
    lon >= SWISS_BOX.lonMin &&
    lon <= SWISS_BOX.lonMax,
  hourly: (lat, lon) => openMeteo('meteoswiss', lat, lon, 'meteoswiss_icon_seamless'),
};

export const openMeteoGlobal: WeatherProvider = {
  id: 'openmeteo',
  covers: () => true,
  hourly: (lat, lon) => openMeteo('openmeteo', lat, lon, null),
};

const PROVIDERS: readonly WeatherProvider[] = [meteoSwiss, openMeteoGlobal];

export function providerFor(lat: number, lon: number): WeatherProvider {
  return PROVIDERS.find((p) => p.covers(lat, lon)) ?? openMeteoGlobal;
}

/** ~5 km grid: enough for rain and snow, too coarse to locate a home. */
export const GRID_DEG = 0.05;

export function snapToGrid(value: number): number {
  return Math.round(Math.round(value / GRID_DEG) * GRID_DEG * 100) / 100;
}
