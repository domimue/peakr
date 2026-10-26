import { renderHook, waitFor } from '@testing-library/react-native';

import { remoteFlagOn, useRemoteFlagsStore } from '@/config/remote-flags';
import * as flagsRepo from '@/data/repositories/flags-repository';
import { assertCanWrite, AddonLockedError } from '@/features/body/queries';

import { addonGuardNow, useBillingStore, useEntitlement } from '../billing-store';
import {
  addonGuardOf,
  addonStateOf,
  bodySubscriptionOf,
  bundleSavingPct,
  entitlementsOf,
  NO_ENTITLEMENTS,
  purchasableTiers,
  subscriptionsOf,
  type CustomerInfoLike,
} from '../model';

jest.mock('@/data/repositories/billing-repository');
jest.mock('@/data/repositories/plan-repository');

const flagsMock =
  flagsRepo as unknown as typeof import('@/data/repositories/__mocks__/flags-repository');

const entitlement = (over: Partial<CustomerInfoLike['entitlements']['active'][string]> = {}) => ({
  productIdentifier: 'peakr_body',
  store: 'PLAY_STORE',
  periodType: 'NORMAL',
  willRenew: true,
  expirationDate: '2026-11-26T00:00:00Z',
  productPlanIdentifier: 'monthly',
  ...over,
});

function info(
  active: CustomerInfoLike['entitlements']['active'],
  all: Record<string, unknown> = active,
): CustomerInfoLike {
  return { entitlements: { active, all }, managementURL: null };
}

/** Billing as RevenueCat reports it, with the add-on switched on remotely. */
function billing(customer: CustomerInfoLike, flag = true) {
  useRemoteFlagsStore.setState({ flags: { addon_body_nutrition: flag }, loaded: true });
  useBillingStore.setState({
    status: 'ready',
    entitlements: entitlementsOf(customer),
    subscriptions: subscriptionsOf(customer),
    devBody: false,
    cachedAddon: null,
  });
}

const ACTIVE = info({ body_nutrition: entitlement() });
const TRIAL = info({ body_nutrition: entitlement({ periodType: 'TRIAL' }) });
const CANCELLED = info({ body_nutrition: entitlement({ willRenew: false }) });
const EXPIRED = info({}, { body_nutrition: entitlement() });
const NEVER = info({});

describe('Body add-on guard', () => {
  it.each([
    ['active', ACTIVE, { state: 'active', canRead: true, canWrite: true, isTrial: false }],
    ['trial', TRIAL, { state: 'trial', canRead: true, canWrite: true, isTrial: true }],
    // Cancelled but paid up: everything until the period ends.
    ['cancelled', CANCELLED, { state: 'cancelled', canRead: true, canWrite: true }],
    // Ended: history readable and exportable, new entries locked.
    ['expired', EXPIRED, { state: 'expired', canRead: true, canWrite: false }],
    ['never bought', NEVER, { state: 'locked', canRead: false, canWrite: false }],
  ] as const)('%s', async (_name, customer, expected) => {
    billing(customer);
    const { result } = await renderHook(() => useEntitlement('body_nutrition'));
    expect(result.current).toMatchObject({ visible: true, ...expected });
    expect(addonGuardNow('body_nutrition')).toEqual(result.current);
  });

  it('hides everything while the remote flag is off, whatever was bought', async () => {
    billing(ACTIVE, false);
    const { result } = await renderHook(() => useEntitlement('body_nutrition'));
    expect(result.current).toMatchObject({ state: 'hidden', visible: false, canRead: false });
  });

  it('the bundle grants Body; the Gym add-on or Training alone does not', () => {
    const plus = entitlement({ productIdentifier: 'peakr_plus' });
    billing(info({ training: plus, plus, body_nutrition: plus }));
    expect(addonGuardNow('body_nutrition').state).toBe('active');
    // Body through the bundle is part of the tier row, not a second subscription.
    expect(useBillingStore.getState().subscriptions.map((s) => s.kind)).toEqual(['tier']);
    billing(info({ training: entitlement({ productIdentifier: 'peakr_training' }) }));
    expect(addonGuardNow('body_nutrition').state).toBe('locked');
    billing(info({ gym: entitlement({ productIdentifier: 'peakr_gym' }) }));
    expect(addonGuardNow('body_nutrition').state).toBe('locked');
  });

  it('a development grant unlocks it only in development builds', () => {
    billing(NEVER);
    useBillingStore.getState().setDevBody(true);
    expect(addonGuardNow('body_nutrition').state).toBe(__DEV__ ? 'active' : 'locked');
  });

  it('writes throw unless the guard allows them', () => {
    billing(EXPIRED);
    expect(() => assertCanWrite()).toThrow(AddonLockedError);
    billing(TRIAL);
    expect(() => assertCanWrite()).not.toThrow();
  });
});

describe('Body add-on state', () => {
  const base = {
    flag: true,
    entitlements: NO_ENTITLEMENTS,
    subscription: undefined,
    granted: false,
    cached: null,
  };

  it('waits for billing, then falls back to the last level the store reported', () => {
    expect(addonStateOf({ ...base, status: 'loading' })).toBe('pending');
    expect(addonStateOf({ ...base, status: 'loading', cached: 'active' })).toBe('active');
    expect(addonStateOf({ ...base, status: 'error', cached: 'expired' })).toBe('expired');
    expect(addonStateOf({ ...base, status: 'unavailable' })).toBe('locked');
    expect(addonStateOf({ ...base, status: 'unavailable', granted: true })).toBe('active');
    expect(addonGuardOf('pending')).toMatchObject({ visible: true, canRead: false });
  });

  it('finds the subscription behind Body: the add-on first, else the bundle', () => {
    const subs = subscriptionsOf(
      info({
        body_nutrition: entitlement(),
        plus: entitlement({ productIdentifier: 'peakr_plus' }),
      }),
    );
    expect(bodySubscriptionOf(subs)?.kind).toBe('body');
    expect(bodySubscriptionOf(subs.filter((s) => s.kind === 'tier'))?.entitlement).toBe('plus');
  });
});

describe('bundle', () => {
  it('is sold once the add-on is switched on, with the saving against both separately', () => {
    expect(purchasableTiers(false)).toEqual(['training']);
    expect(purchasableTiers(true)).toEqual(['training', 'plus']);
    // 59 + 39 = 98 against 89 → 9 %
    expect(bundleSavingPct(59, 39, 89)).toBe(9);
    expect(bundleSavingPct(59, 0, 89)).toBeNull();
    expect(bundleSavingPct(50, 39, 89)).toBeNull();
  });
});

describe('remote flags', () => {
  beforeEach(() => {
    flagsMock.store.server = null;
    flagsMock.store.cached = {};
    useRemoteFlagsStore.setState({ flags: {}, loaded: false });
  });

  it('stays off by default and on in the personal build', () => {
    expect(remoteFlagOn({}, 'addon_body_nutrition', false)).toBe(false);
    expect(remoteFlagOn({}, 'addon_body_nutrition', true)).toBe(true);
    expect(remoteFlagOn({ addon_body_nutrition: true }, 'addon_body_nutrition', false)).toBe(true);
  });

  it('uses the device copy offline and the server value once it answers', async () => {
    flagsMock.store.cached = { addon_body_nutrition: true };
    await useRemoteFlagsStore.getState().load();
    expect(useRemoteFlagsStore.getState().flags.addon_body_nutrition).toBe(true);

    flagsMock.store.server = { addon_body_nutrition: false };
    await useRemoteFlagsStore.getState().load();
    await waitFor(() => expect(useRemoteFlagsStore.getState().loaded).toBe(true));
    expect(useRemoteFlagsStore.getState().flags.addon_body_nutrition).toBe(false);
    expect(flagsMock.store.cached).toEqual({ addon_body_nutrition: false });
  });
});
