/**
 * Which days a pull fetches (Personal tier, pull only). Pure, so it is tested without a database.
 *
 * - Recent window: the last days, because sleep and HRV arrive the morning after and watches sync
 *   late. Ends tomorrow (UTC) so users east of UTC get their "today" too.
 * - Backfill: walks back from the oldest fetched day in steps of `backfillStepDays` until the
 *   tier's history limit, or until two steps in a row before the earliest known value came back
 *   empty (the account has no older data).
 */

export const PULL = {
  recentDaysCron: 3,
  recentDaysManual: 7,
  backfillStepDays: 28,
  /** Empty days before the earliest value after which the backfill stops. */
  emptyStopDays: 56,
} as const;

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface PullPlanInput {
  today: string;
  manual: boolean;
  backfillDays: number;
  state: {
    earliest_day: string | null;
    backfill_before: string | null;
    backfill_done: boolean;
  } | null;
}

export interface PullPlan {
  recent: [string, string];
  /** null when there is nothing (more) to backfill. */
  backfill: [string, string] | null;
}

export function planPull({ today, manual, backfillDays, state }: PullPlanInput): PullPlan {
  const recentFrom = addDays(today, -(manual ? PULL.recentDaysManual : PULL.recentDaysCron) + 1);
  const recent: [string, string] = [recentFrom, addDays(today, 1)];
  if (backfillDays <= 0 || state?.backfill_done) return { recent, backfill: null };
  const limit = addDays(today, -backfillDays + 1);
  const before = state?.backfill_before ?? addDays(today, -PULL.recentDaysManual + 1);
  if (before <= limit) return { recent, backfill: null };
  const from = addDays(before, -PULL.backfillStepDays);
  return { recent, backfill: [from < limit ? limit : from, addDays(before, -1)] };
}

/** New backfill state after a backfill step returned `found` records. */
export function afterBackfill(
  step: [string, string],
  found: number,
  {
    today,
    backfillDays,
    earliestDay,
  }: { today: string; backfillDays: number; earliestDay: string | null },
): { backfill_before: string; backfill_done: boolean } {
  const [from] = step;
  const limit = addDays(today, -backfillDays + 1);
  const anchor = earliestDay ?? today;
  const exhausted = found === 0 && from <= addDays(anchor, -PULL.emptyStopDays);
  return { backfill_before: from, backfill_done: from <= limit || exhausted };
}
