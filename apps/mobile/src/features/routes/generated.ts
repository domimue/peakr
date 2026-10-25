import {
  encodePolyline,
  pickRoundTrips,
  roundTripRequest,
  type LatLon,
  type PickedRoundTrip,
  type RoundTripCandidate,
  type RoundTripRequest,
  type UserProfile,
  type Workout,
} from '@peakr/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { newId } from '@/data/ids';
import * as repo from '@/data/repositories/route-repository';
import type { StoredRoute } from '@/data/repositories/route-repository';
import { supabase } from '@/data/supabase';
import { notifyLocalChange } from '@/data/sync/changes';

import { routeKeys } from './queries';

/**
 * Generated round trips (CLAUDE.md "Terrain intelligence" §2b): the `round-trips` Edge Function
 * asks OpenRouteService for several loops from the start point (API key and cache server-side);
 * the app picks the best ones for the session with the engine's route matching score. A generated
 * route the user chooses or saves becomes a normal library route (source `generated`).
 */

export type ElevationSource = 'swisstopo' | 'ors';

export interface RoundTripResult {
  elevation: ElevationSource;
  candidates: RoundTripCandidate[];
}

export type RoundTripError = 'offline' | 'limit' | 'subscription' | 'failed';

export class GeneratedRoutesError extends Error {
  constructor(readonly reason: RoundTripError) {
    super(`Round trips failed: ${reason}`);
  }
}

function errorReason(error: unknown): RoundTripError {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  if (status === 429) return 'limit';
  if (status === 403) return 'subscription';
  return typeof status === 'number' ? 'failed' : 'offline';
}

export async function fetchRoundTrips(request: RoundTripRequest): Promise<RoundTripResult> {
  if (!supabase) throw new GeneratedRoutesError('offline');
  const band = request.elevationBand;
  const { data, error } = await supabase.functions.invoke<RoundTripResult>('round-trips', {
    body: {
      lat: request.start.lat,
      lon: request.start.lon,
      sport: request.sport,
      targetDistanceM: request.targetDistanceM,
      count: request.count,
      gainPerKm: (band.minGainPerKm + band.maxGainPerKm) / 2,
    },
  });
  if (error) throw new GeneratedRoutesError(errorReason(error));
  if (!data || !Array.isArray(data.candidates)) throw new GeneratedRoutesError('failed');
  return data;
}

/** Same request → same server cache entry; the key leaves out what the server rounds anyway. */
const requestKey = (r: RoundTripRequest) =>
  [
    r.sport,
    r.start.lat.toFixed(3),
    r.start.lon.toFixed(3),
    Math.round(r.targetDistanceM / 500),
    r.count,
  ].join(':');

/** Source key that marks a library route as saved from this generated candidate. */
export const generatedSourceKey = (r: RoundTripRequest, candidateId: string) =>
  `generated:${requestKey(r)}:${candidateId}`;

export interface GeneratedOptions {
  request: RoundTripRequest | null;
  picks: PickedRoundTrip[];
  elevation: ElevationSource | null;
  isFetching: boolean;
  error: RoundTripError | null;
  retry: () => void;
}

/** Generated round trips for a session from `start`, best first (only while `enabled`). */
export function useGeneratedRoutes(
  w: Workout | undefined,
  user: UserProfile | undefined,
  start: LatLon | null,
  enabled: boolean,
  limit = 3,
): GeneratedOptions {
  const request = w && user && start ? roundTripRequest(w, user, start) : null;
  const query = useQuery({
    queryKey: [...routeKeys.all, 'generated', request ? requestKey(request) : ''],
    queryFn: () => fetchRoundTrips(request as RoundTripRequest),
    enabled: enabled && request !== null,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
  const picks =
    query.data && w && user ? pickRoundTrips(query.data.candidates, w, user, start, limit) : [];
  const error = query.error
    ? query.error instanceof GeneratedRoutesError
      ? query.error.reason
      : 'failed'
    : null;
  return {
    request,
    picks,
    elevation: query.data?.elevation ?? null,
    isFetching: query.isFetching,
    error,
    retry: () => void query.refetch(),
  };
}

/** A pick as a (not yet saved) library route, for the row and for saving. */
export function generatedRoute(
  pick: PickedRoundTrip,
  sport: StoredRoute['sport'],
  name: string,
  sourceKey: string,
): Omit<StoredRoute, 'id' | 'createdAt' | 'updatedAt'> {
  const { route } = pick;
  return {
    name,
    sport,
    source: 'generated',
    distanceM: route.distanceM,
    gainM: route.gainM,
    lossM: route.lossM,
    start: route.start,
    polyline: encodePolyline(route.track),
    profile: route.profile,
    climbs: route.climbs,
    sourceKeys: [sourceKey],
  };
}

/** Saves a generated route to the library and returns its id. */
export function useSaveGeneratedRoute() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (draft: Omit<StoredRoute, 'id' | 'createdAt' | 'updatedAt'>) =>
      (await repo.saveRoute({ ...draft, id: newId() })).id,
    onSuccess: async () => {
      notifyLocalChange();
      await client.invalidateQueries({ queryKey: routeKeys.all, exact: true });
    },
  });
}
