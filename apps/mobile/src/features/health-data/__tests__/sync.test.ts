import * as healthRepo from '@/data/repositories/health-repository';

import { fetchHealthRows, fetchHealthStatus, type HealthStatus } from '../api';
import { syncGarminHealth } from '../sync';

jest.mock('@/data/repositories/health-repository');
jest.mock('../api', () => ({
  fetchHealthStatus: jest.fn(),
  fetchHealthRows: jest.fn(),
}));

const { store, resetStore } =
  healthRepo as unknown as typeof import('@/data/repositories/__mocks__/health-repository');

const status = (p: Partial<HealthStatus> = {}): HealthStatus => ({
  connection: {
    status: 'active',
    delivery: 'pull',
    backfillDays: 365,
    provides: ['resting_hr', 'sleep_duration'],
    developerKey: true,
  },
  groups: ['sleep', 'hrv_rhr'],
  sync: { earliestDay: '2026-01-01', backfillDone: false, lastPulledAt: null, lastError: null },
  offers: { oauth: false, personalKey: true },
  ...p,
});

const row = (metric: 'resting_hr' | 'sleep_duration' | 'steps', day: string, at: string) => ({
  metric,
  day,
  source: 'garmin' as const,
  sourceIds: [`${metric}:${day}`],
  recordedAt: `${day}T07:00:00.000Z`,
  value: 50,
  detail: null,
  serverUpdatedAt: at,
});

beforeEach(() => {
  resetStore();
  jest.mocked(fetchHealthRows).mockReset();
});

it('pages through the rows since the cursor and keeps the new cursor', async () => {
  store.cursor = 'c0';
  jest
    .mocked(fetchHealthRows)
    .mockResolvedValueOnce({
      rows: [row('resting_hr', '2026-10-22', 'c1')],
      cursor: 'c1',
      more: true,
    })
    .mockResolvedValueOnce({
      rows: [row('sleep_duration', '2026-10-23', 'c2')],
      cursor: 'c2',
      more: false,
    });
  await syncGarminHealth(status());
  expect(jest.mocked(fetchHealthRows).mock.calls.map((c) => c[0])).toEqual(['c0', 'c1']);
  expect(store.cursor).toBe('c2');
  expect(store.rows.map((r) => r.metric).sort()).toEqual(['resting_hr', 'sleep_duration']);
  expect(store.groups).toEqual(['sleep', 'hrv_rhr']);
});

it('removes values of groups that are off and all Garmin values without a connection', async () => {
  store.rows = [
    { ...row('steps', '2026-10-22', 'x'), source: 'healthConnect' },
    { ...row('resting_hr', '2026-10-22', 'x') },
  ];
  jest.mocked(fetchHealthRows).mockResolvedValue({ rows: [], cursor: null, more: false });
  await syncGarminHealth(status());
  expect(store.rows.map((r) => r.metric)).toEqual(['resting_hr']);

  jest.mocked(fetchHealthStatus).mockResolvedValue(status({ connection: null }));
  await syncGarminHealth();
  expect(store.rows).toEqual([]);
  expect(fetchHealthRows).toHaveBeenCalledTimes(1);
});
