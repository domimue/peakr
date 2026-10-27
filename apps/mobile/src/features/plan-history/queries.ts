import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { todayIso } from '@/data/ids';
import * as repo from '@/data/repositories/plan-repository';

import { planKeys } from '../plan/queries';

/** The plan a same-day "undo" would bring back (null when there is none). */
export function useUndoablePlan() {
  return useQuery({
    queryKey: [...planKeys.archive, 'undo'],
    queryFn: () => repo.undoablePlan(todayIso()),
  });
}

/** Brings the previous plan back and discards the new one (same day only). */
export function useUndoNewPlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => repo.undoNewPlan(todayIso()),
    onSuccess: () => client.invalidateQueries({ queryKey: planKeys.plan }),
  });
}
