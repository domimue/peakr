import type { LatLon } from './geo';
import type { GpxPoint } from './gpx';
import type { RouteSport } from './pace-plan';

/**
 * Generated round trips (CLAUDE.md "Route sources" (b), Phase 8b): an OSM-based routing service
 * (OpenRouteService or GraphHopper) behind this interface, called through an Edge Function so
 * API keys stay server-side; elevation from a DEM. Candidates are then scored with `rankRoutes`.
 * Types only – no implementation yet.
 */

export interface RoundTripRequest {
  start: LatLon;
  sport: RouteSport;
  targetDistanceM: number;
  /** Desired gain per km (from the session and the terrain profile). */
  elevationBand: { minGainPerKm: number; maxGainPerKm: number };
  /** How many different candidates to generate. */
  count: number;
}

export interface RoundTripCandidate {
  /** Provider-specific id (cache key). */
  id: string;
  points: GpxPoint[];
  distanceM: number;
  /** Share of paved / suitable surface for the sport, 0 … 1, if the provider knows it. */
  surfaceSuitability: number | null;
}

export interface RoutingProvider {
  readonly name: string;
  roundTrips(request: RoundTripRequest): Promise<RoundTripCandidate[]>;
}
