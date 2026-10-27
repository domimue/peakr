import {
  resolveDaily,
  type DailyValue,
  type HealthGroup,
  type HealthMetric,
  type HealthSource,
} from '@peakr/engine';

import { countBySource } from '../health-counts';
import type { StoredHealthRow } from '../health-repository';

/** In-memory health data for Jest (`jest.mock('@/data/repositories/health-repository')`). */

export type { StoredHealthRow } from '../health-repository';

export const store = {
  rows: [] as StoredHealthRow[],
  cursor: null as string | null,
  groups: [] as HealthGroup[],
};

export function resetStore(): void {
  store.rows = [];
  store.cursor = null;
  store.groups = [];
}

const key = (r: Pick<StoredHealthRow, 'metric' | 'day' | 'source'>) =>
  `${r.metric}|${r.day}|${r.source}`;

export const saveHealthRows = jest.fn(async (rows: readonly StoredHealthRow[]) => {
  for (const row of rows) {
    store.rows = store.rows.filter((r) => key(r) !== key(row)).concat(row);
  }
});

export const getDailyValues = jest.fn(
  async (opts: { metrics?: readonly HealthMetric[]; from?: string } = {}): Promise<DailyValue[]> =>
    resolveDaily(
      store.rows
        .filter(
          (r) =>
            (!opts.metrics || opts.metrics.includes(r.metric)) &&
            (!opts.from || r.day >= opts.from),
        )
        .flatMap((r) =>
          (r.sourceIds.length ? r.sourceIds : ['']).map((sourceId) => ({ ...r, sourceId })),
        ),
    ),
);

export const deleteHealthRecords = jest.fn(
  async (opts: { source?: HealthSource; metrics?: readonly HealthMetric[] } = {}) => {
    store.rows = store.rows.filter(
      (r) =>
        !(
          (!opts.source || r.source === opts.source) &&
          (!opts.metrics || opts.metrics.includes(r.metric))
        ),
    );
    if (!opts.metrics && (!opts.source || opts.source === 'garmin')) store.cursor = null;
  },
);

export const getHealthCursor = jest.fn(async () => store.cursor);
export const setHealthCursor = jest.fn(async (cursor: string | null) => {
  store.cursor = cursor;
});
export const getEnabledGroups = jest.fn(async () => store.groups);
export const saveEnabledGroups = jest.fn(async (groups: readonly HealthGroup[]) => {
  store.groups = [...groups];
});
export const getSourceCounts = jest.fn(async () => countBySource(store.rows));
