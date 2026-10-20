import { planConfig } from '../plan/config';
import { decodePolyline, haversineM, resampleTrack, trackLengthM, type LatLon } from './geo';
import type { RouteSport } from './pace-plan';

/**
 * Routes recognised from the user's past activities (CLAUDE.md "Route sources"): outdoor runs and
 * rides that start at the same place, have about the same length and follow the same path are
 * one route. Used only for the owner's own library (Strava API Agreement).
 */

const cfg = planConfig.routes.recognition;

export interface TrackActivity {
  /** Activity key (`<source>:<externalId>`). */
  key: string;
  sport: string;
  /** ISO start timestamp; the most recent activity represents the route. */
  startTime: string;
  indoor: boolean;
  /** Encoded polyline (Google format). */
  polyline: string | null;
}

export interface RecognisedRoute {
  sport: RouteSport;
  /** Key of the most recent activity on this route (its track and profile represent it). */
  representativeKey: string;
  /** All activities on this route, most recent first. */
  activityKeys: string[];
  occurrences: number;
  distanceM: number;
  /** Start date of the most recent activity. */
  lastDate: string;
  polyline: string;
}

interface Candidate {
  activity: TrackActivity;
  sport: RouteSport;
  track: LatLon[];
  samples: LatLon[];
  lengthM: number;
}

/** Local planar projection (metres) around a latitude. */
function toXY(p: LatLon, refLat: number) {
  const k = (Math.PI / 180) * 6_371_008.8;
  return { x: p.lon * k * Math.cos((refLat * Math.PI) / 180), y: p.lat * k };
}

/** Mean distance from each sample of `a` to the polyline through the samples of `b`. */
function meanDeviation(a: readonly LatLon[], b: readonly LatLon[]): number {
  const ref = (a[0] as LatLon).lat;
  const pb = b.map((p) => toXY(p, ref));
  let sum = 0;
  for (const p of a) {
    const q = toXY(p, ref);
    let best = Infinity;
    for (let i = 0; i < pb.length - 1; i++) {
      const s = pb[i] as { x: number; y: number };
      const e = pb[i + 1] as { x: number; y: number };
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      // Samples are evenly spaced along a non-empty track, so `len` is never 0.
      const len = Math.max(dx * dx + dy * dy, 1e-12);
      const t = Math.max(0, Math.min(1, ((q.x - s.x) * dx + (q.y - s.y) * dy) / len));
      best = Math.min(best, Math.hypot(q.x - (s.x + t * dx), q.y - (s.y + t * dy)));
    }
    sum += best;
  }
  return sum / a.length;
}

/** Same route: same sport, starts close, similar length, and paths overlap both ways. */
function isSameRoute(a: Candidate, b: Candidate): boolean {
  if (a.sport !== b.sport) return false;
  if (haversineM(a.track[0] as LatLon, b.track[0] as LatLon) > cfg.startRadiusM) return false;
  const longer = Math.max(a.lengthM, b.lengthM);
  if (Math.abs(a.lengthM - b.lengthM) > longer * cfg.distanceTolerance) return false;
  return (
    meanDeviation(a.samples, b.samples) <= cfg.maxMeanDeviationM &&
    meanDeviation(b.samples, a.samples) <= cfg.maxMeanDeviationM
  );
}

function candidateOf(activity: TrackActivity): Candidate | null {
  if (activity.indoor || !activity.polyline) return null;
  if (activity.sport !== 'run' && activity.sport !== 'bike') return null;
  const track = decodePolyline(activity.polyline);
  const lengthM = trackLengthM(track);
  if (lengthM === 0) return null;
  return {
    activity,
    sport: activity.sport,
    track,
    samples: resampleTrack(track, cfg.samplePoints),
    lengthM,
  };
}

/**
 * Groups activities into routes. `exclude`: activity keys already in the library – a group
 * containing one of them is not suggested again. Most frequent routes first.
 */
export function recogniseRoutes(
  activities: readonly TrackActivity[],
  exclude: ReadonlySet<string> = new Set(),
): RecognisedRoute[] {
  const candidates = activities
    .map(candidateOf)
    .filter((c): c is Candidate => c !== null)
    .sort(
      (a, b) =>
        b.activity.startTime.localeCompare(a.activity.startTime) ||
        a.activity.key.localeCompare(b.activity.key),
    );
  const groups: Candidate[][] = [];
  for (const c of candidates) {
    const group = groups.find((g) => isSameRoute(g[0] as Candidate, c));
    if (group) group.push(c);
    else groups.push([c]);
  }
  return groups
    .filter((g) => g.length >= cfg.minOccurrences && !g.some((c) => exclude.has(c.activity.key)))
    .map((g) => {
      const rep = g[0] as Candidate;
      return {
        sport: rep.sport,
        representativeKey: rep.activity.key,
        activityKeys: g.map((c) => c.activity.key),
        occurrences: g.length,
        distanceM: Math.round(rep.lengthM),
        lastDate: rep.activity.startTime.slice(0, 10),
        polyline: rep.activity.polyline as string,
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences || b.lastDate.localeCompare(a.lastDate));
}
