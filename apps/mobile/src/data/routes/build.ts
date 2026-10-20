import {
  buildRouteProfile,
  encodePolyline,
  parseGpx,
  type GpxPoint,
  type RouteSport,
} from '@peakr/engine';

import type { RouteSource } from '../db/schema';
import type { NewRoute } from '../repositories/route-repository';

/** A library route without its id (the caller decides it). */
export type RouteDraft = Omit<NewRoute, 'id'>;

/** Builds a library route from track points (profile, simplified track, stats, climbs). */
export function routeFromPoints(
  points: readonly GpxPoint[],
  name: string,
  sport: RouteSport,
  source: RouteSource,
  sourceKeys: string[] = [],
): RouteDraft {
  const p = buildRouteProfile(points);
  return {
    name,
    sport,
    source,
    distanceM: p.distanceM,
    gainM: p.gainM,
    lossM: p.lossM,
    start: p.start,
    polyline: encodePolyline(p.track),
    profile: p.profile,
    climbs: p.climbs,
    sourceKeys,
  };
}

/** Library id of a route planned in Strava – stable, so a changed route replaces the old one. */
export const stravaRouteId = (externalId: string) => `strava-route-${externalId}`;

/** A route the user planned in Strava (exported as GPX by the server) as a library route. */
export function stravaRouteDraft(
  externalId: string,
  name: string,
  sport: RouteSport,
  gpx: string,
): RouteDraft | null {
  const parsed = parseGpx(gpx);
  if (!parsed.ok) return null;
  return routeFromPoints(parsed.value.points, name, sport, 'strava_route', [
    `strava-route:${externalId}`,
  ]);
}
