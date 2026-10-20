import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as repo from '@/data/repositories/strength-repository';

/**
 * TanStack Query hooks over the strength setup. Routines, exercises and sessions are in the gym
 * workspace (`features/gym/queries.ts`).
 */

export const strengthKeys = {
  setup: ['strength', 'setup'] as const,
};

export function useStrengthSetup() {
  return useQuery({ queryKey: strengthKeys.setup, queryFn: repo.getStrengthSetup });
}

export function useSaveStrengthSetup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: repo.saveStrengthSetup,
    onSuccess: () => client.invalidateQueries({ queryKey: strengthKeys.setup }),
  });
}
