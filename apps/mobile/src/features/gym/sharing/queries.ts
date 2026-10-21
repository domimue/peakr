import type { ShareSettings } from '@peakr/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as repo from '@/data/repositories/share-repository';

const key = ['gym', 'share-settings'] as const;

export function useShareSettings() {
  return useQuery({ queryKey: key, queryFn: repo.getShareSettings });
}

export function useSaveShareSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: ShareSettings) => repo.saveShareSettings(settings),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}
