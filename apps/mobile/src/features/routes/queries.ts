import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notifyLocalChange } from '@/data/sync/changes';
import { newId } from '@/data/ids';
import * as repo from '@/data/repositories/route-repository';

import type { RouteDraft } from './import';

/** TanStack Query hooks over the local route library and activity streams. */

export const routeKeys = {
  all: ['routes'] as const,
  one: (id: string) => ['routes', id] as const,
  streams: ['routes', 'streams'] as const,
};

export function useRoutes() {
  return useQuery({ queryKey: routeKeys.all, queryFn: repo.listRoutes });
}

export function useRoute(id: string | undefined) {
  return useQuery({
    queryKey: routeKeys.one(id ?? ''),
    queryFn: () => (id ? repo.getRoute(id) : null),
    enabled: id !== undefined,
  });
}

/** All imported activity streams (route recognition, terrain profile, evaluation). */
export function useStreams() {
  return useQuery({ queryKey: routeKeys.streams, queryFn: repo.listStreams });
}

function useInvalidate() {
  const client = useQueryClient();
  return async () => {
    notifyLocalChange();
    await client.invalidateQueries({ queryKey: routeKeys.all });
  };
}

export function useSaveRoute() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (draft: RouteDraft) => repo.saveRoute({ ...draft, id: newId() }),
    onSuccess: invalidate,
  });
}

export function useRenameRoute() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => repo.renameRoute(id, name),
    onSuccess: invalidate,
  });
}

export function useDeleteRoute() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => repo.deleteRoute(id),
    onSuccess: invalidate,
  });
}
