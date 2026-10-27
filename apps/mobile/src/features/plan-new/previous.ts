import { useArchivedPlans, usePlan } from '../plan/queries';
import type { PreviousPlan } from './calibrate';

/** The active plan, else the most recent archived one (a plan that ended on its own). */
export function usePreviousPlan(): { previous: PreviousPlan | null; isPending: boolean } {
  const plan = usePlan();
  const archive = useArchivedPlans();
  const latest = archive.data?.[0];
  return {
    previous: plan.data ?? (latest ? { state: latest.state, input: latest.input } : null),
    isPending: plan.isPending || archive.isPending,
  };
}
