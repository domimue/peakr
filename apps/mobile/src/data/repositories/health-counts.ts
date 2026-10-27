import type { HealthMetric, HealthSource } from '@peakr/engine';

/** Stored values per metric and source with the latest day (developer diagnostics). Pure. */
export interface SourceCount {
  metric: HealthMetric;
  source: HealthSource;
  count: number;
  latestDay: string;
}

export function countBySource(
  rows: readonly { metric: HealthMetric; source: HealthSource; day: string }[],
): SourceCount[] {
  const by = new Map<string, SourceCount>();
  for (const r of rows) {
    const key = `${r.metric}|${r.source}`;
    const prev = by.get(key);
    if (!prev) by.set(key, { metric: r.metric, source: r.source, count: 1, latestDay: r.day });
    else {
      prev.count++;
      if (r.day > prev.latestDay) prev.latestDay = r.day;
    }
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...by.values()].sort((a, b) => cmp(a.metric, b.metric) || cmp(a.source, b.source));
}
