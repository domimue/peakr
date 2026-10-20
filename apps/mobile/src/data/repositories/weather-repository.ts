import type { WeatherForecast } from '@peakr/engine';
import { eq } from 'drizzle-orm';

import { parseWeatherSettings, type WeatherSettings } from '../../features/weather/settings';
import { db } from '../db/client';
import { appSettings } from '../db/schema';

/**
 * Weather check on this device: the settings and the last forecast (so the chip and the hints
 * still work offline for a while). Tests replace it with the in-memory version in `__mocks__`.
 */

/** The home start point (Terrain profile) is the fallback location of the weather check. */
export { getHomeStart } from './route-repository';

const SETTINGS_KEY = 'weather.settings';
const FORECAST_KEY = 'weather.forecast';

async function read(key: string): Promise<unknown> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    return null;
  }
}

async function write(key: string, data: unknown): Promise<void> {
  const value = JSON.stringify(data);
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function getWeatherSettings(): Promise<WeatherSettings> {
  return parseWeatherSettings(await read(SETTINGS_KEY));
}

export async function saveWeatherSettings(settings: WeatherSettings): Promise<void> {
  await write(SETTINGS_KEY, settings);
}

export interface CachedForecast {
  forecast: WeatherForecast;
  /** Which location it is for (rounded), so a changed location does not reuse it. */
  cell: string;
}

export async function getCachedForecast(): Promise<CachedForecast | null> {
  const value = await read(FORECAST_KEY);
  return value && typeof value === 'object' && 'forecast' in value
    ? (value as CachedForecast)
    : null;
}

export async function saveCachedForecast(cached: CachedForecast): Promise<void> {
  await write(FORECAST_KEY, cached);
}

/** Turning the check off (or signing out) removes the stored forecast and its location. */
export async function clearCachedForecast(): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, FORECAST_KEY));
}
