import { activityKeys, dedupeActivities, type Activity } from '@peakr/engine';
import { useQuery } from '@tanstack/react-query';

import * as repo from '@/data/repositories/activity-repository';

/** Imported activities as the screens see them: merged across sources, with their links. */

export const activityQueryKeys = { all: ['activities'] as const };

export interface LinkedActivity {
  activity: Activity;
  /** When this device received the newest record of it, epoch ms. */
  syncedAt: number;
}

async function fetchLinked(): Promise<Map<string, LinkedActivity>> {
  const [records, links] = await Promise.all([repo.listActivities(), repo.listLinks()]);
  const byKey = new Map(links.map((l) => [l.activityKey, l.workoutId]));
  const syncedAt = new Map(records.map((r) => [`${r.source}:${r.externalId}`, r.importedAt]));
  const out = new Map<string, LinkedActivity>();
  for (const activity of dedupeActivities(records)) {
    const keys = activityKeys(activity);
    const workoutId = keys.map((k) => byKey.get(k)).find((id) => id !== undefined);
    if (!workoutId || out.has(workoutId)) continue;
    out.set(workoutId, {
      activity,
      syncedAt: Math.max(...keys.map((k) => syncedAt.get(k) ?? 0)),
    });
  }
  return out;
}

/** Linked activity per workout id. */
export function useLinkedActivities() {
  return useQuery({ queryKey: [...activityQueryKeys.all, 'linked'], queryFn: fetchLinked });
}

export function useWorkoutActivity(workoutId: string): LinkedActivity | null {
  const { data } = useLinkedActivities();
  return data?.get(workoutId) ?? null;
}
