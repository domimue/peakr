import { shareFile, type ShareResult } from '@/features/sharing/share-file';
import type { ArchivedPlan } from '@/data/repositories/plan-repository';

/**
 * The plan history as JSON (the user's own data, always exportable): per archived plan its goal,
 * dates, outcome, summary, review and every done or skipped session – planned ones that never
 * happened are left out.
 */
export function planHistoryJson(archived: readonly ArchivedPlan[], exportedAt: string): string {
  return JSON.stringify(
    {
      exportedAt,
      plans: archived.map((a) => ({
        goal: a.goal,
        startDate: a.startDate,
        endDate: a.endDate,
        archivedAt: new Date(a.archivedAt).toISOString(),
        outcome: a.outcome,
        summary: a.summary,
        review: a.review,
        sessions: a.state.plan.weeks
          .flatMap((w) => w.workouts)
          .filter((w) => a.state.status[w.id] !== undefined)
          .map((w) => ({
            date: w.date,
            sport: w.sport,
            type: w.type,
            title: w.templateId,
            durationMin: w.durationMin,
            load: w.load,
            status: a.state.status[w.id],
          })),
      })),
    },
    null,
    2,
  );
}

export function exportPlanHistory(
  archived: readonly ArchivedPlan[],
  today: string,
): Promise<ShareResult> {
  return shareFile({
    name: `peakr-plan-history-${today}.json`,
    mime: 'application/json',
    uti: 'public.json',
    bytes: new TextEncoder().encode(planHistoryJson(archived, new Date().toISOString())),
  });
}
