import {
  accessOf,
  changeFrom,
  entitlementsOf,
  firstChargeDate,
  periodOf,
  subscriptionsOf,
  tierOf,
  type CustomerInfoLike,
} from '../model';

function info(active: CustomerInfoLike['entitlements']['active']): CustomerInfoLike {
  return {
    entitlements: { active },
    managementURL: 'https://store/manage',
    subscriptionsByProductIdentifier: { peakr_gym_yearly: { managementURL: 'https://store/gym' } },
  };
}

const training = {
  productIdentifier: 'peakr_training_monthly',
  store: 'PLAY_STORE',
  periodType: 'NORMAL',
  willRenew: true,
  expirationDate: '2026-11-21T00:00:00Z',
};
const gym = {
  productIdentifier: 'peakr_gym_yearly',
  store: 'APP_STORE',
  periodType: 'TRIAL',
  willRenew: false,
  expirationDate: '2026-10-28T00:00:00Z',
};

describe('billing model', () => {
  it('keeps the tier and the add-on independent', () => {
    expect(entitlementsOf(info({ training }))).toMatchObject({ tier: 'training', gym: false });
    expect(entitlementsOf(info({ gym }))).toMatchObject({ tier: 'none', gym: true });
    expect(entitlementsOf(info({ training, plus: training, gym }))).toMatchObject({
      tier: 'plus',
      gym: true,
    });
  });

  it('lists tier and add-on side by side with their own dates and management links', () => {
    const rows = subscriptionsOf(info({ training, gym }), { peakr_gym_yearly: 'CHF 29.00' });
    expect(rows.map((r) => r.entitlement)).toEqual(['training', 'gym']);
    const [tier, addon] = rows;
    expect(tier).toMatchObject({
      kind: 'tier',
      period: 'monthly',
      store: 'play_store',
      willRenew: true,
      managementUrl: 'https://store/manage',
    });
    expect(addon).toMatchObject({
      kind: 'gym',
      period: 'yearly',
      store: 'app_store',
      isTrial: true,
      willRenew: false,
      priceString: 'CHF 29.00',
      managementUrl: 'https://store/gym',
    });
  });

  it('reads the period from the product id', () => {
    expect(periodOf('peakr_gym:yearly')).toBe('yearly');
    expect(periodOf('peakr_gym_annual')).toBe('yearly');
    expect(periodOf('peakr_gym:monthly')).toBe('monthly');
    expect(periodOf('whatever')).toBeNull();
  });
});

describe('access', () => {
  const ready = { status: 'ready' as const, devBuild: false, cached: null };

  it('gives full access during the trial and while paid, read-only once it lapsed', () => {
    expect(accessOf({ ...ready, entitlements: entitlementsOf(info({ training: gym })) })).toBe(
      'full',
    );
    const lapsed = { ...info({}), entitlements: { active: {}, all: { training: {} } } };
    expect(accessOf({ ...ready, entitlements: entitlementsOf(lapsed) })).toBe('readOnly');
    expect(accessOf({ ...ready, entitlements: entitlementsOf(info({})) })).toBe('preview');
  });

  it('the Gym add-on alone does not unlock the plan', () => {
    expect(accessOf({ ...ready, entitlements: entitlementsOf(info({ gym })) })).toBe('preview');
  });

  it('waits for billing in release builds and falls back to the last known level', () => {
    const none = entitlementsOf(info({}));
    expect(accessOf({ status: 'loading', entitlements: none, devBuild: false, cached: null })).toBe(
      'pending',
    );
    expect(accessOf({ status: 'error', entitlements: none, devBuild: false, cached: 'full' })).toBe(
      'full',
    );
    expect(
      accessOf({ status: 'unavailable', entitlements: none, devBuild: false, cached: null }),
    ).toBe('preview');
    expect(
      accessOf({ status: 'unavailable', entitlements: none, devBuild: true, cached: null }),
    ).toBe('full');
  });
});

describe('trial and plan changes', () => {
  it('charges first when the trial ends', () => {
    expect(firstChargeDate(new Date('2026-10-24T09:00:00Z'), 7).toISOString()).toBe(
      '2026-10-31T09:00:00.000Z',
    );
  });

  it('reads the tier from the product id', () => {
    expect(tierOf('peakr_training:yearly')).toBe('training');
    expect(tierOf('peakr_plus_monthly')).toBe('plus');
    expect(tierOf('peakr_gym')).toBeNull();
  });

  it('replaces the current store subscription when the period or tier changes', () => {
    const [current] = subscriptionsOf(
      info({
        training: {
          ...training,
          productIdentifier: 'peakr_training',
          productPlanIdentifier: 'monthly',
        },
      }),
    );
    expect(current?.period).toBe('monthly');
    expect(changeFrom(current, { productId: 'peakr_training:yearly', period: 'yearly' })).toBe(
      'peakr_training',
    );
    expect(
      changeFrom(current, { productId: 'peakr_training:monthly', period: 'monthly' }),
    ).toBeNull();
    expect(
      changeFrom(undefined, { productId: 'peakr_training:yearly', period: 'yearly' }),
    ).toBeNull();
    const web = current ? { ...current, store: 'stripe' as const } : undefined;
    expect(changeFrom(web, { productId: 'peakr_training:yearly', period: 'yearly' })).toBeNull();
  });
});
