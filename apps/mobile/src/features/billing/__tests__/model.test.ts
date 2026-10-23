import { entitlementsOf, periodOf, subscriptionsOf, type CustomerInfoLike } from '../model';

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
    expect(entitlementsOf(info({ training }))).toEqual({ tier: 'training', gym: false });
    expect(entitlementsOf(info({ gym }))).toEqual({ tier: 'none', gym: true });
    expect(entitlementsOf(info({ training, plus: training, gym }))).toEqual({
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
