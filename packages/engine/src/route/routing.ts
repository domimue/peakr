import { planConfig } from '../plan/config';
import type { UserProfile, Workout } from '../plan/types';
import { sameTrack } from './cluster';
import type { LatLon } from './geo';
import type { GpxPoint } from './gpx';
import { scoreRoute, type MatchableRoute, type RouteMatch } from './match';
import { sessionFlatSpeedKmh, type RouteSport } from './pace-plan';
import { buildRouteProfile, type RouteProfile } from './profile';

/**
 * Generated round trips (CLAUDE.md "Route sources" (b), Phase 8b): an OSM-based routing service
 * (OpenRouteService) behind this interface, called through an Edge Function so API keys stay
 * server-side; elevation from a DEM. This file builds the request for a planned session and picks
 * the best of the returned candidates with the route matching score.
 */

const cfg = planConfig.routes.generate;

export interface RoundTripRequest {
  start: LatLon;
  sport: RouteSport;
  targetDistanceM: number;
  /**
   * Desired gain per km (from the session and the terrain profile). Providers that cannot steer
   * elevation ignore it; the candidates are judged against it afterwards.
   */
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

const isRouteSport = (sport: string): sport is RouteSport => sport === 'run' || sport === 'bike';

/** Gain per km the session wants: its planned terrain, else flat ground. */
export function desiredGainPerKm(w: Workout, sport: RouteSport): number {
  return w.terrain?.gainPerKm ?? planConfig.terrain.gainPerKm[sport].flat;
}

/**
 * Length of a round trip that takes the session's duration at its gain per km: the flat distance,
 * shortened for climbing (run: flat metres per metre climbed; bike: minutes per 100 m of gain).
 */
export function roundTripDistanceM(w: Workout, user: UserProfile, sport: RouteSport): number {
  const speed = sessionFlatSpeedKmh(w, user, sport);
  const gain = desiredGainPerKm(w, sport);
  const hours = w.durationMin / 60;
  const km =
    sport === 'run'
      ? (speed * hours) / (1 + (gain * cfg.runFlatMPerGainM) / 1000)
      : hours / (1 / speed + (gain / 100) * (planConfig.terrain.bikeMinPer100mGain / 60));
  return Math.round(Math.min(cfg.maxDistanceM, Math.max(cfg.minDistanceM, km * 1000)));
}

/** The round-trip request for a planned run or ride from `start`; null for other sports. */
export function roundTripRequest(
  w: Workout,
  user: UserProfile,
  start: LatLon,
  count: number = cfg.candidates,
): RoundTripRequest | null {
  if (!isRouteSport(w.sport) || w.durationMin <= 0) return null;
  const gain = desiredGainPerKm(w, w.sport);
  return {
    start,
    sport: w.sport,
    targetDistanceM: roundTripDistanceM(w, user, w.sport),
    elevationBand: {
      minGainPerKm: Math.max(0, gain - cfg.bandHalfWidthGainPerKm),
      maxGainPerKm: gain + cfg.bandHalfWidthGainPerKm,
    },
    count,
  };
}

export interface PickedRoundTrip {
  candidate: RoundTripCandidate;
  /** Smoothed profile, simplified track and climbs, as for a library route. */
  route: RouteProfile;
  match: RouteMatch;
}

/** A generated candidate as a matchable route (profile built like an imported GPX). */
export function matchableCandidate(
  c: RoundTripCandidate,
  sport: RouteSport,
  route: RouteProfile,
): MatchableRoute {
  return {
    id: c.id,
    sport,
    distanceM: route.distanceM,
    gainPerKm: route.distanceM > 0 ? route.gainM / (route.distanceM / 1000) : 0,
    profile: route.profile,
    start: route.start,
    surfaceSuitability: c.surfaceSuitability,
  };
}

/**
 * The best generated round trips for a session: each candidate scored with the route matching
 * score (duration, elevation band, start, climb, surface), unsuitable ones dropped, near-identical
 * tracks kept once. Best first, ties by id; at most `limit`.
 */
export function pickRoundTrips(
  candidates: readonly RoundTripCandidate[],
  w: Workout,
  user: UserProfile,
  start: LatLon | null,
  limit = 3,
): PickedRoundTrip[] {
  if (!isRouteSport(w.sport)) return [];
  const sport = w.sport;
  const scored = candidates
    .filter((c) => c.points.length >= 2)
    .map((candidate) => {
      const route = buildRouteProfile(candidate.points);
      const match = scoreRoute(matchableCandidate(candidate, sport, route), w, user, start);
      return { candidate, route, match };
    })
    .filter((p) => p.match.score > 0)
    .sort((a, b) => b.match.score - a.match.score || a.candidate.id.localeCompare(b.candidate.id));
  const kept: PickedRoundTrip[] = [];
  for (const p of scored) {
    if (kept.length >= limit) break;
    if (!kept.some((k) => sameTrack(sport, k.route.track, p.route.track))) kept.push(p);
  }
  return kept;
}
