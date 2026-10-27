import {
  recogniseRoutes,
  type ActivitySource,
  type RecognisedRoute,
  type SourceRef,
} from '@peakr/engine';
import { useMemo } from 'react';

import * as routeRepo from '@/data/repositories/route-repository';
import type { RouteDraft } from '@/data/routes/build';
import { requestSync } from '@/data/sync/use-background-sync';
import { useActivityRecords } from '@/features/activities/queries';
import { fetchStravaStreams } from '@/features/integrations/api';

import { pointsFromActivity, routeFromPoints } from './import';
import { useRoutes } from './queries';

const externalIdOf = (key: string) => key.slice(key.indexOf(':') + 1);
const sourceOf = (key: string) => key.slice(0, key.indexOf(':')) as ActivitySource;

/**
 * Routes recognised from the user's own past activities (CLAUDE.md "Route sources") that are not
 * in the library yet, with their typical duration and climb. GPS fragments are left out by the
 * engine's minimum distance per sport.
 */
export function useRouteSuggestions() {
  const { data: records, isPending } = useActivityRecords();
  const { data: library } = useRoutes();
  const suggestions = useMemo(() => {
    const known = new Set((library ?? []).flatMap((r) => r.sourceKeys));
    const tracks = (records ?? []).map((a) => ({
      key: `${a.source}:${a.externalId}`,
      sport: a.sport,
      startTime: a.startTime,
      indoor: a.indoor,
      polyline: a.polyline,
      durationSec: a.durationSec,
      elevationGainM: a.elevationGainM,
    }));
    return recogniseRoutes(tracks, known);
  }, [records, library]);
  return { suggestions, isPending };
}

/**
 * The library draft of a suggestion – with the elevation profile of its most recent activity.
 * Activities imported before the route library have no elevation stream yet: fetched once.
 */
export async function suggestionDraft(
  route: RecognisedRoute,
  name: string,
  userId: string | null,
): Promise<{ draft: RouteDraft; hasElevation: boolean }> {
  const ref: SourceRef = {
    source: sourceOf(route.representativeKey),
    externalId: externalIdOf(route.representativeKey),
  };
  let [stream] = await routeRepo.getStreams([ref]);
  if (!stream && ref.source === 'strava' && userId) {
    if (await fetchStravaStreams([ref.externalId])) {
      await requestSync(userId);
      [stream] = await routeRepo.getStreams([ref]);
    }
  }
  const draft = routeFromPoints(
    pointsFromActivity(route.polyline, stream ?? null),
    name,
    route.sport,
    'strava',
    route.activityKeys,
  );
  return { draft, hasElevation: stream !== undefined };
}
