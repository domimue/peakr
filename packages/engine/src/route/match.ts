import { planConfig } from '../plan/config';
import { workoutLibrary } from '../plan/library';
import type { ElevationPoint } from '../plan/terrain';
import type { UserProfile, Workout } from '../plan/types';
import { haversineM, type LatLon } from './geo';
import { estimateSessionOnRouteSec, type RouteSport } from './pace-plan';
import { findClimbs, hasHillRepeatSegment } from './profile';

/**
 * Route matching (CLAUDE.md "Terrain intelligence" §3): how well a library route fits a planned
 * session – duration on that route, elevation band, sport, distance from the user's start, and a
 * suitable climb for hill sessions.
 */

const cfg = planConfig.routes;

export interface MatchableRoute {
  id: string;
  sport: RouteSport;
  distanceM: number;
  gainPerKm: number;
  profile: ElevationPoint[];
  start: LatLon;
}

export type MatchReason =
  'wrongSport' | 'noClimb' | 'tooLong' | 'tooShort' | 'tooHilly' | 'tooFlat' | 'farFromStart';

export interface RouteMatch {
  routeId: string;
  /** 0 … 1; 0 = unsuitable. */
  score: number;
  /** Expected duration of the session on this route. */
  durationSec: number;
  parts: { duration: number; elevation: number; start: number };
  /** Why the score is lower (each part below 0.5) or 0. */
  reasons: MatchReason[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const falloff = (deviation: number, tolerance: number) => Math.max(0, 1 - deviation / tolerance);

/** Hill sessions need a climb: run 200–400 m at 5–8 %, bike a climb of at least 1 km. */
function climbOk(w: Workout, route: MatchableRoute): boolean {
  const template = workoutLibrary.find((t) => t.id === w.templateId);
  if (template?.terrain !== 'climb') return true;
  if (route.sport === 'run') return hasHillRepeatSegment(route.profile);
  return findClimbs(route.profile).some((c) => c.endM - c.startM >= cfg.bikeClimbMinLengthM);
}

export function scoreRoute(
  route: MatchableRoute,
  w: Workout,
  user: UserProfile,
  start: LatLon | null,
): RouteMatch {
  const durationSec = Math.round(estimateSessionOnRouteSec(w, route.sport, route.profile, user));
  const reasons: MatchReason[] = [];
  const zero = (reason: MatchReason): RouteMatch => ({
    routeId: route.id,
    score: 0,
    durationSec,
    parts: { duration: 0, elevation: 0, start: 0 },
    reasons: [reason],
  });
  if (route.sport !== w.sport) return zero('wrongSport');
  if (!climbOk(w, route)) return zero('noClimb');

  const target = w.durationMin * 60;
  const duration = falloff(Math.abs(durationSec - target) / target, cfg.match.durationTolerance);
  if (duration < 0.5) reasons.push(durationSec > target ? 'tooLong' : 'tooShort');

  const desired = w.terrain?.gainPerKm ?? planConfig.terrain.gainPerKm[route.sport].flat;
  const elevation = falloff(
    Math.abs(route.gainPerKm - desired),
    cfg.match.elevationToleranceGainPerKm,
  );
  if (elevation < 0.5) reasons.push(route.gainPerKm > desired ? 'tooHilly' : 'tooFlat');

  const startPart = start ? falloff(haversineM(start, route.start), cfg.match.startMaxM) : 1;
  if (startPart < 0.5) reasons.push('farFromStart');

  const weights = cfg.match.weights;
  return {
    routeId: route.id,
    score: round2(
      duration * weights.duration + elevation * weights.elevation + startPart * weights.start,
    ),
    durationSec,
    parts: { duration: round2(duration), elevation: round2(elevation), start: round2(startPart) },
    reasons,
  };
}

/** Best suitable routes first (score > 0), ties by id; at most `limit`. */
export function rankRoutes(
  routes: readonly MatchableRoute[],
  w: Workout,
  user: UserProfile,
  start: LatLon | null,
  limit = 3,
): RouteMatch[] {
  return routes
    .map((r) => scoreRoute(r, w, user, start))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.routeId.localeCompare(b.routeId))
    .slice(0, limit);
}
