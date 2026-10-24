import { describe, expect, it } from 'vitest';

import {
  statusOf,
  storeManagementUrl,
  subscriptionViews,
  type EntitlementRow,
} from '../subscription';

const NOW = new Date('2026-10-24T12:00:00Z');
const row = (patch: Partial<EntitlementRow> = {}): EntitlementRow => ({
  entitlement: 'training',
  product_id: 'prod_1',
  store: 'stripe',
  period_type: 'trial',
  will_renew: true,
  expires_at: '2026-10-31T12:00:00Z',
  price_string: 'CHF 59.00',
  management_url: null,
  ...patch,
});

describe('account subscription', () => {
  it('names trial, renewal, cancellation, end and lifetime', () => {
    expect(statusOf(row(), NOW)).toBe('trial');
    expect(statusOf(row({ period_type: 'normal' }), NOW)).toBe('active');
    expect(statusOf(row({ will_renew: false }), NOW)).toBe('cancelled');
    expect(statusOf(row({ expires_at: '2026-10-01T00:00:00Z' }), NOW)).toBe('expired');
    expect(statusOf(row({ expires_at: null }), NOW)).toBe('lifetime');
  });

  it('shows Plus instead of Training (same purchase) and the Gym add-on separately', () => {
    const views = subscriptionViews(
      [row(), row({ entitlement: 'plus' }), row({ entitlement: 'gym', store: 'play_store' })],
      NOW,
    );
    expect(views.map((v) => v.entitlement)).toEqual(['plus', 'gym']);
  });

  it('links store subscriptions to the store', () => {
    const [view] = subscriptionViews([row({ store: 'play_store' })], NOW);
    expect(storeManagementUrl(view!)).toContain('play.google.com');
  });
});
