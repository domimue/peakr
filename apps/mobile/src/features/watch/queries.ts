import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as repo from '@/data/repositories/watch-repository';

import type { WatchChoice } from './options';

/** TanStack Query hooks of the watch choice. */

export const watchKeys = { choice: ['watch', 'choice'] as const };

export function useWatchChoice() {
  return useQuery({ queryKey: watchKeys.choice, queryFn: repo.getWatchChoice });
}

export function useSaveWatchChoice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (choice: WatchChoice) => repo.saveWatchChoice(choice),
    onSuccess: () => client.invalidateQueries({ queryKey: watchKeys.choice }),
  });
}
