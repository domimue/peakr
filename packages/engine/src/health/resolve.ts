import { healthConfig } from './config';
import type { DailyValue, HealthRecord, HealthSource } from './types';

/** Code-point order, so the result does not depend on the device locale. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function rank(source: HealthSource): number {
  return healthConfig.sourcePriority.indexOf(source);
}

/**
 * One value per metric and day: the source with the highest priority wins (Garmin > Health
 * Connect), within one source the most recent recording. All source ids are kept.
 */
export function resolveDaily(records: readonly HealthRecord[]): DailyValue[] {
  const groups = new Map<string, HealthRecord[]>();
  for (const r of records) {
    if (!Number.isFinite(r.value)) continue;
    const key = `${r.metric}|${r.day}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const out: DailyValue[] = [];
  for (const list of groups.values()) {
    const best = [...list].sort(
      (a, b) =>
        rank(a.source) - rank(b.source) ||
        cmp(b.recordedAt, a.recordedAt) ||
        cmp(a.sourceId, b.sourceId),
    )[0] as HealthRecord;
    const sourceIds: DailyValue['sourceIds'] = [];
    for (const r of list) {
      if (!sourceIds.some((s) => s.source === r.source && s.id === r.sourceId)) {
        sourceIds.push({ source: r.source, id: r.sourceId });
      }
    }
    out.push({
      metric: best.metric,
      day: best.day,
      value: best.value,
      source: best.source,
      recordedAt: best.recordedAt,
      detail: best.detail ?? null,
      sourceIds,
    });
  }
  return out.sort((a, b) => cmp(a.metric, b.metric) || cmp(a.day, b.day));
}
