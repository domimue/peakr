import { isEnabled } from '../feature-flags';

describe('feature flags', () => {
  it('turns the developer flags on in the personal build', () => {
    // `garminPersonalKey` itself is switched on in `featureFlags` for now (commit "feature flags"),
    // so only the personal-build side is asserted here.
    expect(isEnabled('garminPersonalKey', true)).toBe(true);
    // Partner features stay off until their approval, personal build or not.
    expect(isEnabled('garminHealth', true)).toBe(false);
    expect(isEnabled('komootApi', true)).toBe(false);
    // Outside a personal build the default is the store build's value.
    expect(isEnabled('generatedRoutes')).toBe(true);
  });
});
