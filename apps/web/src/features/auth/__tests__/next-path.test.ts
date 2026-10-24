import { describe, expect, it } from 'vitest';

import { normalizeEmail, safeNext } from '../next-path';

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/checkout/claim?session_id=cs_1')).toBe('/checkout/claim?session_id=cs_1');
  });

  it('falls back for other sites and garbage', () => {
    expect(safeNext('//evil.test')).toBe('/account');
    expect(safeNext('https://evil.test')).toBe('/account');
    expect(safeNext('/\\evil.test')).toBe('/account');
    expect(safeNext(null, '/get-app')).toBe('/get-app');
  });
});

describe('normalizeEmail', () => {
  it('trims and lower-cases valid addresses', () => {
    expect(normalizeEmail('  Ann@Example.COM ')).toBe('ann@example.com');
    expect(normalizeEmail('nope')).toBeNull();
  });
});
