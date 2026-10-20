import {
  suggestSelection,
  ZONE_NUMBERS,
  type BaselineActivity,
  type HrZone,
  type Sport,
} from '@peakr/engine';

import {
  clearBaseline,
  getBaselineMeta,
  replaceBaseline,
  type StoredBaselineActivity,
} from '@/data/repositories/baseline-repository';
import { supabase } from '@/data/supabase';

/**
 * Baseline import (CLAUDE.md "Baseline from past activities"). The Edge Function
 * `strava-baseline` reads the runs, rides and swims of the last 60 days – the window is fixed on
 * the server – into its own table, never into the activities the plan uses.
 */

/** Wire shape of a `baseline_activities` row. */
interface BaselineRow {
  external_id: string;
  sport: Sport;
  name: string | null;
  start_date_local: string;
  duration_sec: number;
  distance_m: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  indoor: boolean;
  manual: boolean;
  workout_type: number | null;
  best_20min_hr: number | null;
}

interface StravaHrZones {
  zones?: { min: number; max: number }[];
}

interface ImportResponse {
  activities: BaselineRow[];
  hrZones: StravaHrZones | null;
  zonesScopeMissing: boolean;
}

export type ImportResult =
  | { ok: true; activities: number }
  | { ok: false; reason: 'not_connected' | 'rate_limited' | 'reconnect' | 'error' };

/** Strava workout types that mark a race: run 1, ride 11. */
const RACE_TYPES = new Set([1, 11]);

export function fromRow(r: BaselineRow): BaselineActivity & { name: string | null } {
  return {
    externalId: r.external_id,
    sport: r.sport,
    name: r.name,
    date: r.start_date_local.slice(0, 10),
    durationSec: r.duration_sec,
    distanceM: r.distance_m,
    elevationGainM: r.elevation_gain_m,
    avgHr: r.avg_hr,
    maxHr: r.max_hr,
    indoor: r.indoor,
    manual: r.manual,
    race: r.workout_type !== null && RACE_TYPES.has(r.workout_type),
    best20MinHr: r.best_20min_hr,
  };
}

/** Strava's five custom zones as engine zones (open ends at the bottom and top); else null. */
export function stravaZones(hr: StravaHrZones | null): HrZone[] | null {
  const zones = hr?.zones;
  if (!zones || zones.length !== ZONE_NUMBERS.length) return null;
  return ZONE_NUMBERS.map((zone, i) => {
    const z = zones[i] as { min: number; max: number };
    return {
      zone,
      minBpm: i === 0 ? null : z.min,
      maxBpm: i === zones.length - 1 || z.max <= 0 ? null : z.max,
    };
  });
}

async function errorReason(error: unknown): Promise<string> {
  try {
    const context = (error as { context?: Response } | null)?.context;
    return ((await context?.json()) as { error?: string } | undefined)?.error ?? 'error';
  } catch {
    return 'error';
  }
}

/**
 * Imports the baseline and stores it with the preselection (outliers unticked). The user's
 * entries from an earlier import are kept.
 */
export async function importBaseline(): Promise<ImportResult> {
  if (!supabase) return { ok: false, reason: 'error' };
  const { data, error } = await supabase.functions.invoke<ImportResponse>(
    'strava-baseline/import',
    { body: {} },
  );
  if (error || !data) {
    const reason = await errorReason(error);
    return {
      ok: false,
      reason:
        reason === 'not_connected' || reason === 'rate_limited' || reason === 'reconnect'
          ? reason
          : 'error',
    };
  }
  const activities = data.activities.map(fromRow);
  const suggestions = new Map(suggestSelection(activities).map((s) => [s.externalId, s]));
  const rows: StoredBaselineActivity[] = activities.map((a) => ({
    ...a,
    selected: suggestions.get(a.externalId)?.selected ?? true,
    outlier: suggestions.get(a.externalId)?.reason ?? null,
  }));
  const previous = await getBaselineMeta();
  await replaceBaseline(rows, {
    importedAt: Date.now(),
    stravaHrZones: stravaZones(data.hrZones),
    zonesScopeMissing: data.zonesScopeMissing,
    overrides: previous?.overrides ?? {},
  });
  return { ok: true, activities: rows.length };
}

/**
 * Access revoked on Strava's side (the webhook removes the connection and the server baseline):
 * the copy on this device goes too. Checked only while a local baseline exists.
 */
export async function dropRevokedBaseline(): Promise<void> {
  if (!supabase || !(await getBaselineMeta())) return;
  const { data, error } = await supabase
    .from('integrations')
    .select('provider')
    .eq('provider', 'strava')
    .maybeSingle();
  if (!error && !data) await clearBaseline();
}

/** Deletes the baseline on the server and on this device. */
export async function deleteBaseline(): Promise<boolean> {
  await clearBaseline();
  if (!supabase) return true;
  const { error } = await supabase.functions.invoke('strava-baseline', { method: 'DELETE' });
  return !error;
}
