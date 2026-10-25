import { isEnabled } from '../feature-flags';

describe('feature flags', () => {
  it('turns the developer flags on only in the personal build', () => {
    expect(isEnabled('garminPersonalKey', false)).toBe(false);
    expect(isEnabled('garminPersonalKey', true)).toBe(true);
    // Partner features stay off until their approval, personal build or not.
    expect(isEnabled('garminHealth', true)).toBe(false);
    expect(isEnabled('komootApi', true)).toBe(false);
    // Outside a personal build the default is the store build's value.
    expect(isEnabled('garminPersonalKey')).toBe(false);
    expect(isEnabled('generatedRoutes')).toBe(true);
  });
});
