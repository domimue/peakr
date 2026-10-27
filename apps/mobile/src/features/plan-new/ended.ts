import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { todayIso } from '@/data/ids';
import * as repo from '@/data/repositories/plan-repository';

import { planKeys } from '../plan/queries';

/**
 * A plan whose last day has passed is archived on its own (completed or finished) – checked when
 * Today opens. The empty Today then offers "Create a new plan".
 */
export function useArchiveEndedPlan(): void {
  const client = useQueryClient();
  useEffect(() => {
    let alive = true;
    repo
      .archiveEndedPlan(todayIso())
      .then((id) => {
        if (id && alive) void client.invalidateQueries({ queryKey: planKeys.plan });
      })
      .catch((e: unknown) => console.warn('Archiving the ended plan failed', e));
    return () => {
      alive = false;
    };
  }, [client]);
}
