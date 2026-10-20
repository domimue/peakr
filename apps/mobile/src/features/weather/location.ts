import type { LatLon } from '@peakr/engine';
import * as Location from 'expo-location';

import { getHomeStart } from '@/data/repositories/weather-repository';

import type { WeatherSettings } from './settings';

/**
 * Where the forecast is for. "Current location" uses the foreground permission the user granted
 * when turning the weather check on – it is never asked for here – and a recent last-known position
 * where possible. Without permission or a fix, the home start point from the Terrain profile.
 */

export interface WeatherLocation {
  point: LatLon;
  source: 'current' | 'home';
}

const LAST_KNOWN_MAX_AGE_MS = 3 * 3_600_000;

async function currentPoint(): Promise<LatLon | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const position =
      (await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: position.coords.latitude, lon: position.coords.longitude };
  } catch {
    return null;
  }
}

export async function weatherLocation(settings: WeatherSettings): Promise<WeatherLocation | null> {
  if (settings.source === 'current') {
    const point = await currentPoint();
    if (point) return { point, source: 'current' };
  }
  const home = await getHomeStart();
  return home ? { point: home, source: 'home' } : null;
}

/** Asks for the foreground location permission (turning the check on with "current location"). */
export async function askLocationPermission(): Promise<boolean> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    return permission.granted;
  } catch {
    return false;
  }
}

/** ~5 km cell, the same grid as the Edge Function's cache. */
export function locationCell(p: LatLon): string {
  const snap = (v: number) => (Math.round(v / 0.05) * 0.05).toFixed(2);
  return `${snap(p.lat)}:${snap(p.lon)}`;
}
