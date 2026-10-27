import type { Goal, PlanOutcome, PlanState, PlanSummary } from '@peakr/engine';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '../db/client';
import { planArchive, type StoredPlanInput } from '../db/schema';
import { notifyLocalChange } from '../sync/changes';

/**
 * Archived plans (CLAUDE.md "Plan history"). Written once when a plan is replaced or ends
 * (`plan-repository`), then read-only apart from the review answers and the same-day undo.
 */

export interface ArchivedPlan {
  id: string;
  input: StoredPlanInput;
  goal: Goal;
  startDate: string;
  endDate: string;
  archivedAt: number;
  outcome: PlanOutcome;
  summary: PlanSummary;
  review: Record<string, unknown> | null;
  state: PlanState;
}

/** One archive row as it travels to and from the server; times in epoch ms. */
export interface SyncArchivedPlan extends ArchivedPlan {
  deleted: boolean;
  updatedAt: number;
}

type Row = typeof planArchive.$inferSelect;

function fromRow({ deleted: _d, updatedAt: _u, dirty: _x, ...row }: Row): ArchivedPlan {
  return { ...row, review: row.review ?? null };
}

/** Archived plans, newest first. */
export async function listArchivedPlans(): Promise<ArchivedPlan[]> {
  const rows = await db
    .select()
    .from(planArchive)
    .where(eq(planArchive.deleted, false))
    .orderBy(desc(planArchive.archivedAt));
  return rows.map(fromRow);
}

export async function getArchivedPlan(id: string): Promise<ArchivedPlan | null> {
  const row = await db.query.planArchive.findFirst({
    where: and(eq(planArchive.id, id), eq(planArchive.deleted, false)),
  });
  return row ? fromRow(row) : null;
}

/** Stores the "How was your last plan?" answers with the archived plan. */
export async function saveArchiveReview(id: string, review: Record<string, unknown>) {
  await db
    .update(planArchive)
    .set({ review, updatedAt: Date.now(), dirty: true })
    .where(eq(planArchive.id, id));
  notifyLocalChange();
}

// --- Sync ------------------------------------------------------------------------------------

export function readDirtyArchive(): SyncArchivedPlan[] {
  return db
    .select()
    .from(planArchive)
    .where(eq(planArchive.dirty, true))
    .all()
    .map((row) => ({ ...fromRow(row), deleted: row.deleted, updatedAt: row.updatedAt }));
}

/** Clears the dirty flag of what was pushed (unless it changed again meanwhile). */
export function markArchivePushed(rows: readonly SyncArchivedPlan[]): void {
  db.transaction((tx) => {
    for (const r of rows) {
      tx.update(planArchive)
        .set({ dirty: false })
        .where(and(eq(planArchive.id, r.id), eq(planArchive.updatedAt, r.updatedAt)))
        .run();
    }
  });
}

/** Local versions (id → updatedAt), deleted rows included – for the merge. */
export function readArchiveVersions(): Map<string, number> {
  const rows = db
    .select({ id: planArchive.id, updatedAt: planArchive.updatedAt })
    .from(planArchive)
    .all();
  return new Map(rows.map((r) => [r.id, r.updatedAt]));
}

/** Writes the server's newer versions (never dirty). */
export function applyArchiveFromServer(rows: readonly SyncArchivedPlan[]): void {
  db.transaction((tx) => {
    for (const r of rows) {
      const values = { ...r, dirty: false };
      tx.insert(planArchive)
        .values(values)
        .onConflictDoUpdate({ target: planArchive.id, set: values })
        .run();
    }
  });
}
