import { renderHook } from '@testing-library/react-native';

import { useAccess, useBillingStore, useHasGym } from '../billing-store';
import { NO_ENTITLEMENTS } from '../model';

jest.mock('@/config/build', () => ({ personalBuild: true }));
jest.mock('@/data/repositories/billing-repository');

it('unlocks training and the Gym add-on without billing in a personal build', async () => {
  useBillingStore.setState({
    status: 'unavailable',
    entitlements: NO_ENTITLEMENTS,
    cachedAccess: null,
  });
  expect((await renderHook(() => useAccess())).result.current).toBe('full');
  expect((await renderHook(() => useHasGym())).result.current).toBe(true);
});
