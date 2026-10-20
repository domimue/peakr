import { activityKey, type ActivityLink, type SourceActivity, type SourceRef } from '@peakr/engine';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client';
import { activities, activityLinks } from '../db/schema';

/**
 * Imported activities on the device: one row per source record (Strava now, watch providers and
 * health data later) plus the links to the planned workouts they fulfilled. Merging records of the
 * same workout happens in `@peakr/engine` (`dedupeActivities`) when they are read.
 */

export interface StoredActivity extends SourceActivity {
  importedAt: number;
  handled: boolean;
}

const CHUNK = 100;

function toSource(row: typeof activities.$inferSelect): StoredActivity {
  return {
    source: row.source,
    externalId: row.externalId,
    sport: row.sport,
    startTime: row.startTime,
    date: row.date,
    durationSec: row.durationSec,
    distanceM: row.distanceM,
    elevationGainM: row.elevationGainM,
    avgHr: row.avgHr,
    maxHr: row.maxHr,
    swimPaceSecPer100m: row.swimPaceSecPer100m,
    polyline: row.polyline,
    name: row.name,
    indoor: row.indoor,
    commute: row.commute,
    summary: row.summary,
    rpe: row.rpe,
    importedAt: row.importedAt,
    handled: row.handled,
  };
}

export async function listActivities(): Promise<StoredActivity[]> {
  const rows = await db.select().from(activities);
  return rows.map(toSource);
}

/**
 * Stores activities from the server. Updates keep `handled` (an edited title must not rebalance
 * the plan again); deleted ones disappear together with their link.
 */
export function applyActivities(
  upserts: readonly SourceActivity[],
  deletes: readonly SourceRef[],
  now = Date.now(),
): void {
  db.transaction((tx) => {
    for (const a of upserts) {
      const { source, externalId, ...data } = a;
      tx.insert(activities)
        .values({ source, externalId, ...data, importedAt: now, handled: false })
        .onConflictDoUpdate({ target: [activities.source, activities.externalId], set: data })
        .run();
    }
    for (const d of deletes) {
      tx.delete(activities)
        .where(and(eq(activities.source, d.source), eq(activities.externalId, d.externalId)))
        .run();
    }
    const keys = deletes.map(activityKey);
    for (let i = 0; i < keys.length; i += CHUNK) {
      tx.delete(activityLinks)
        .where(inArray(activityLinks.activityKey, keys.slice(i, i + CHUNK)))
        .run();
    }
  });
}

export function markHandled(refs: readonly SourceRef[]): void {
  db.transaction((tx) => {
    for (const r of refs) {
      tx.update(activities)
        .set({ handled: true })
        .where(and(eq(activities.source, r.source), eq(activities.externalId, r.externalId)))
        .run();
    }
  });
}

export async function listLinks(): Promise<(ActivityLink & { planId: string })[]> {
  return db
    .select({
      activityKey: activityLinks.activityKey,
      workoutId: activityLinks.workoutId,
      planId: activityLinks.planId,
    })
    .from(activityLinks);
}

export function addLinks(planId: string, links: readonly ActivityLink[], now = Date.now()): void {
  if (links.length === 0) return;
  db.transaction((tx) => {
    for (const l of links) {
      tx.insert(activityLinks)
        .values({ activityKey: l.activityKey, workoutId: l.workoutId, planId, linkedAt: now })
        .onConflictDoNothing()
        .run();
    }
  });
}
