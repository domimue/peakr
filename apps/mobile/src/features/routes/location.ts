import type { LatLon } from '@peakr/engine';
import * as Location from 'expo-location';

/**
 * The device's current position, read once for the home start point. Foreground permission only,
 * asked when the user taps "Use current location"; nothing is tracked.
 */

export type CurrentLocation =
  { ok: true; value: LatLon } | { ok: false; error: 'denied' | 'unavailable' };

export async function currentLocation(): Promise<CurrentLocation> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { ok: false, error: 'denied' };
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { ok: true, value: { lat: coords.latitude, lon: coords.longitude } };
  } catch {
    // Location services off, no fix, or no location hardware.
    return { ok: false, error: 'unavailable' };
  }
}
