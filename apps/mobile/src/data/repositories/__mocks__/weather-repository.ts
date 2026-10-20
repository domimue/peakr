import { DEFAULT_WEATHER_SETTINGS, type WeatherSettings } from '../../../features/weather/settings';
import type { LatLon } from '@peakr/engine';

import type { CachedForecast } from '../weather-repository';

/** In-memory weather settings and forecast for Jest (`jest.mock('@/data/repositories/weather-repository')`). */

export type { CachedForecast } from '../weather-repository';

export const store = {
  settings: DEFAULT_WEATHER_SETTINGS as WeatherSettings,
  cached: null as CachedForecast | null,
  home: null as LatLon | null,
};

export function resetStore(): void {
  store.settings = DEFAULT_WEATHER_SETTINGS;
  store.cached = null;
  store.home = null;
}

export const getHomeStart = jest.fn(async () => store.home);

export const getWeatherSettings = jest.fn(async () => store.settings);
export const saveWeatherSettings = jest.fn(async (settings: WeatherSettings) => {
  store.settings = settings;
});
export const getCachedForecast = jest.fn(async () => store.cached);
export const saveCachedForecast = jest.fn(async (cached: CachedForecast) => {
  store.cached = cached;
});
export const clearCachedForecast = jest.fn(async () => {
  store.cached = null;
});
