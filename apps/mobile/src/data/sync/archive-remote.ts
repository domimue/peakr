import type { SupabaseClient } from '@supabase/supabase-js';

import type { SyncArchivedPlan } from '../repositories/plan-archive-repository';
import { check, fetchPaged, since } from './remote';

/**
 * Supabase side of the plan history (table `plan_archive`, one row per archived plan, last write
 * wins). A large plan is one big JSON row, so pushes go a few rows at a time.
 */

const PUSH_CHUNK = 5;

interface ArchiveRow {
  id: string;
  input: SyncArchivedPlan['input'];
  goal: SyncArchivedPlan['goal'];
  start_date: string;
  end_date: string;
  archived_at: string;
  outcome: SyncArchivedPlan['outcome'];
  summary: SyncArchivedPlan['summary'];
  review: SyncArchivedPlan['review'];
  state: SyncArchivedPlan['state'];
  deleted: boolean;
  updated_at: string;
  server_updated_at: string;
}

const iso = (ms: number) => new Date(ms).toISOString();

export async function pushArchive(
  client: SupabaseClient,
  userId: string,
  list: readonly SyncArchivedPlan[],
): Promise<void> {
  for (let i = 0; i < list.length; i += PUSH_CHUNK) {
    const rows = list.slice(i, i + PUSH_CHUNK).map((a) => ({
      user_id: userId,
      id: a.id,
      input: a.input,
      goal: a.goal,
      start_date: a.startDate,
      end_date: a.endDate,
      archived_at: iso(a.archivedAt),
      outcome: a.outcome,
      summary: a.summary,
      review: a.review,
      state: a.state,
      deleted: a.deleted,
      updated_at: iso(a.updatedAt),
    }));
    const { error } = await client.from('plan_archive').upsert(rows, { onConflict: 'user_id,id' });
    check(error, 'push plan archive');
  }
}

export async function pullArchive(
  client: SupabaseClient,
  cursor: string | null,
): Promise<{ rows: SyncArchivedPlan[]; cursor: string | null }> {
  const after = since(cursor);
  const rows = await fetchPaged<ArchiveRow>(
    (from, to) =>
      client
        .from('plan_archive')
        .select('*')
        .gt('server_updated_at', after)
        .order('server_updated_at')
        .order('id')
        .range(from, to)
        .overrideTypes<ArchiveRow[], { merge: false }>(),
    'pull plan archive',
  );
  let next = cursor;
  for (const row of rows) {
    if (!next || Date.parse(row.server_updated_at) > Date.parse(next)) next = row.server_updated_at;
  }
  return {
    rows: rows.map((row) => ({
      id: row.id,
      input: row.input,
      goal: row.goal,
      startDate: row.start_date,
      endDate: row.end_date,
      archivedAt: Date.parse(row.archived_at),
      outcome: row.outcome,
      summary: row.summary,
      review: row.review,
      state: row.state,
      deleted: row.deleted,
      updatedAt: Date.parse(row.updated_at),
    })),
    cursor: next,
  };
}
