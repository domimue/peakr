import { describe, expect, it } from 'vitest';

import { signFunnelUser, verifyFunnelUser } from '../funnel-cookie';

const USER = '6f1c2a4e-1b2c-4d5e-8f90-123456789abc';

describe('funnel cookie', () => {
  it('round-trips a signed user id', () => {
    expect(verifyFunnelUser(signFunnelUser(USER, 's3cret'), 's3cret')).toBe(USER);
  });

  it('rejects another secret, a forged id and garbage', () => {
    const value = signFunnelUser(USER, 's3cret');
    expect(verifyFunnelUser(value, 'other')).toBeNull();
    const forged = value.replace(USER, '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d');
    expect(verifyFunnelUser(forged, 's3cret')).toBeNull();
    expect(verifyFunnelUser('nonsense', 's3cret')).toBeNull();
    expect(verifyFunnelUser(undefined, 's3cret')).toBeNull();
  });

  it('never verifies without a secret', () => {
    expect(verifyFunnelUser(signFunnelUser(USER, ''), '')).toBeNull();
  });
});
