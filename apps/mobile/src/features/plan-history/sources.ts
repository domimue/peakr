import type { HistorySource } from '@peakr/engine';
import { useMemo } from 'react';

import type { ArchivedPlan } from '@/data/repositories/plan-repository';

import { useArchivedPlans, usePlan } from '../plan/queries';

/**
 * The plans Insights reads (CLAUDE.md "Plan history"): `current` – the active plan ("This
 * plan"); `all` – the active plan and every archived one ("All time"). Archived plans keep the
 * profile they were made with, so their distances stay what they were.
 */
export function useHistorySources() {
  const plan = usePlan();
  const archive = useArchivedPlans();
  const stored = plan.data;
  const archived = archive.data;
  const value = useMemo(() => {
    const current: HistorySource[] = stored
      ? [{ planId: stored.id, state: stored.state, profile: stored.input.profile }]
      : [];
    const past: ArchivedPlan[] = archived ?? [];
    const all: HistorySource[] = [
      ...current,
      ...past.map((a) => ({ planId: a.id, state: a.state, profile: a.input.profile })),
    ];
    return { current, all, archived: past, currentId: stored?.id ?? null };
  }, [stored, archived]);
  return {
    ...value,
    isPending: plan.isPending || archive.isPending,
    isError: plan.isError || archive.isError,
    refetch: () => {
      void plan.refetch();
      void archive.refetch();
    },
  };
}
