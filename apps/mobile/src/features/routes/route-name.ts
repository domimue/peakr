import { decodePolyline, haversineM, type LatLon, type RouteSport } from '@peakr/engine';
import * as Location from 'expo-location';
import type { TFunction } from 'i18next';

/** Within this distance of the home start point a route is a "home loop". */
const HOME_RADIUS_M = 300;

/**
 * A name the user recognises later, suggested from the start point: "Home loop 5.5 km" from the
 * home start point, otherwise the place it starts ("Seefeld loop 5.5 km") from the phone's own
 * geocoder – no paid service. Without either the plain "Run 5.5 km"; the user can always edit it.
 */
export async function suggestRouteName(
  t: TFunction,
  route: { polyline: string; sport: RouteSport; distanceM: number },
  home: LatLon | null,
): Promise<string> {
  const km = Math.round(route.distanceM / 100) / 10;
  const fallback = t('routes.recognise.defaultName', {
    sport: t(`routes.sport.${route.sport}`),
    km,
  });
  const [start] = decodePolyline(route.polyline);
  if (!start) return fallback;
  if (home && haversineM(home, start) <= HOME_RADIUS_M)
    return t('routes.suggestedName.home', { km });
  try {
    const [place] = await Location.reverseGeocodeAsync({
      latitude: start.lat,
      longitude: start.lon,
    });
    const name = place?.district ?? place?.subregion ?? place?.city ?? place?.street ?? null;
    return name ? t('routes.suggestedName.place', { place: name, km }) : fallback;
  } catch {
    return fallback;
  }
}
