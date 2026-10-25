/**
 * The routing provider behind the `round-trips` Edge Function: OpenRouteService round trips with
 * the global DEM heights ORS adds itself (`elevation: true`), and in Switzerland the heights of
 * swisstopo's terrain model instead. Any swisstopo failure falls back to the ORS heights.
 *
 * Secrets: ORS_API_KEY (required). Optional: ORS_BASE_URL (self-hosted ORS or a paid endpoint),
 * SWISSTOPO_PROFILE_URL (defaults to the public GeoAdmin profile service).
 */

import {
  applySwissProfile,
  closer,
  correctedLength,
  inSwitzerland,
  mapOrsRoundTrip,
  orsProfile,
  orsRoundTripBody,
  swissProfileRequest,
  type OrsGeoJson,
  type RoundTripCandidate,
  type RoundTripQuery,
  type RoundTripResponse,
  type SwissProfilePoint,
} from './model.ts';

export class RoutingError extends Error {
  constructor(readonly status: number | 'config' | 'network') {
    super(`Routing provider failed: ${status}`);
  }
}

const ORS_DEFAULT = 'https://api.openrouteservice.org';
const SWISSTOPO_DEFAULT = 'https://api3.geo.admin.ch/rest/services/profile.json';

async function orsRoundTrip(
  q: RoundTripQuery,
  seed: number,
  lengthM: number,
): Promise<RoundTripCandidate | null> {
  const key = Deno.env.get('ORS_API_KEY');
  if (!key) throw new RoutingError('config');
  const base = Deno.env.get('ORS_BASE_URL') ?? ORS_DEFAULT;
  let response: Response;
  try {
    response = await fetch(`${base}/v2/directions/${orsProfile(q)}/geojson`, {
      method: 'POST',
      headers: {
        Authorization: key,
        'Content-Type': 'application/json',
        Accept: 'application/geo+json, application/json',
      },
      body: JSON.stringify(orsRoundTripBody(q, seed, lengthM)),
    });
  } catch {
    throw new RoutingError('network');
  }
  // 404 / 400: no route from this start (e.g. in the middle of a lake) – not an error for the rest.
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new RoutingError(response.status);
  return mapOrsRoundTrip((await response.json()) as OrsGeoJson, q.sport, `ors-${seed}`);
}

/** One seed: the round trip, asked once more with a corrected length when it missed by far. */
async function seededRoundTrip(
  q: RoundTripQuery,
  seed: number,
): Promise<RoundTripCandidate | null> {
  const first = await orsRoundTrip(q, seed, q.targetDistanceM);
  if (!first) return null;
  const retryLength = correctedLength(q.targetDistanceM, q.targetDistanceM, first.distanceM);
  if (retryLength === null) return first;
  const second = await orsRoundTrip(q, seed, retryLength).catch(() => null);
  return closer(q.targetDistanceM, first, second);
}

async function swissHeights(c: RoundTripCandidate): Promise<RoundTripCandidate | null> {
  const { geom, samples } = swissProfileRequest(c.points, c.distanceM);
  const url = new URL(Deno.env.get('SWISSTOPO_PROFILE_URL') ?? SWISSTOPO_DEFAULT);
  url.searchParams.set('sr', '2056');
  url.searchParams.set('nb_points', String(samples));
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geom),
    });
    if (!response.ok) return null;
    const points = applySwissProfile(c.points, (await response.json()) as SwissProfilePoint[]);
    return points ? { ...c, points } : null;
  } catch {
    return null;
  }
}

/**
 * `count` round trips with seeds 0 … count−1 (deterministic, so a cache miss later gives the same
 * routes). Seeds are requested one after another to stay within the per-minute quota.
 */
export async function generateRoundTrips(q: RoundTripQuery): Promise<RoundTripResponse> {
  const candidates: RoundTripCandidate[] = [];
  for (let seed = 0; seed < q.count; seed++) {
    const c = await seededRoundTrip(q, seed);
    if (c) candidates.push(c);
  }
  if (!inSwitzerland(q)) return { provider: 'openrouteservice', elevation: 'ors', candidates };
  const swiss = await Promise.all(candidates.map(swissHeights));
  const allSwiss = swiss.every((c) => c !== null);
  return {
    provider: 'openrouteservice',
    elevation: allSwiss && candidates.length > 0 ? 'swisstopo' : 'ors',
    candidates: candidates.map((c, i) => swiss[i] ?? c),
  };
}
