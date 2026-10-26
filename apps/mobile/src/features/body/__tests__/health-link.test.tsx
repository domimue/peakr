import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useRemoteFlagsStore } from '@/config/remote-flags';
import * as bodyRepo from '@/data/repositories/body-repository';
import { useBillingStore } from '@/features/billing/billing-store';
import { entitlementsOf, subscriptionsOf, type CustomerInfoLike } from '@/features/billing/model';
import { mapWorkoutEnergy } from '@/features/health/device-map';
import { health } from '@/features/health/health';

import { readBodyHealth, useConnectBodyHealth } from '../health-link';

jest.mock('@/features/health/health', () => ({
  health: {
    store: 'healthConnect',
    isSupported: jest.fn(async () => true),
    bodyReadable: jest.fn(async () => ['weight', 'steps']),
    requestBodyPermission: jest.fn(async () => ['weight', 'steps']),
    readBody: jest.fn(async () => [
      { metric: 'weight', day: '2026-10-25', value: 70.2, recordedAt: 'x' },
      { metric: 'steps', day: '2026-10-25', value: 8000, recordedAt: 'x' },
    ]),
  },
}));
jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/billing-repository');

const body = bodyRepo as unknown as typeof import('@/data/repositories/__mocks__/body-repository');

function addon(active: boolean) {
  const e = {
    productIdentifier: 'peakr_body',
    store: 'PLAY_STORE',
    periodType: 'NORMAL',
    willRenew: true,
    expirationDate: '2026-12-01T00:00:00Z',
  };
  const info: CustomerInfoLike = {
    entitlements: { active: active ? { body_nutrition: e } : {}, all: { body_nutrition: e } },
    managementURL: null,
  };
  useRemoteFlagsStore.setState({ flags: { addon_body_nutrition: true }, loaded: true });
  useBillingStore.setState({
    status: 'ready',
    entitlements: entitlementsOf(info),
    subscriptions: subscriptionsOf(info),
    devBody: false,
  });
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } })}
  >
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  body.resetStore();
});

describe('Body ↔ Health Connect', () => {
  it('stores what is allowed with its source and drops metrics that were withdrawn', async () => {
    body.store.device = [
      {
        metric: 'intake_kcal',
        day: '2026-10-24',
        source: 'healthConnect',
        value: 1800,
        recordedAt: 'x',
      },
    ];
    expect(await readBodyHealth(new Date('2026-10-26T08:00:00Z'))).toBe(2);
    expect(body.store.device.map((d) => [d.metric, d.source])).toEqual([
      ['weight', 'healthConnect'],
      ['steps', 'healthConnect'],
    ]);
  });

  it('asks for the permission only while the add-on is active', async () => {
    addon(false);
    const locked = await renderHook(() => useConnectBodyHealth(), { wrapper });
    locked.result.current.mutate();
    await waitFor(() => expect(locked.result.current.isError).toBe(true));
    expect(health.requestBodyPermission).not.toHaveBeenCalled();

    addon(true);
    const active = await renderHook(() => useConnectBodyHealth(), { wrapper });
    active.result.current.mutate();
    await waitFor(() => expect(active.result.current.isSuccess).toBe(true));
    expect(health.requestBodyPermission).toHaveBeenCalledTimes(1);
  });

  it('sums workout energy per day and skips Peakr’s own records', () => {
    expect(
      mapWorkoutEnergy(
        [
          { startTime: '2026-10-25T07:00:00Z', kcal: 300 },
          { startTime: '2026-10-25T17:00:00Z', kcal: 200.4 },
          {
            startTime: '2026-10-25T18:00:00Z',
            kcal: 150,
            metadata: { dataOrigin: 'com.peakr.app' },
          },
          { startTime: '2026-10-26T07:00:00Z', kcal: 0 },
        ],
        'com.peakr.app',
      ),
    ).toEqual([{ day: '2026-10-25', value: 500 }]);
  });
});
