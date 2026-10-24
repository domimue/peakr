import { describe, expect, it } from 'vitest';

import { accountLink, checkoutReminderTexts, isDue, type CheckoutRow } from './index';

const NOW = new Date('2026-10-24T12:00:00Z');
const row = (patch: Partial<CheckoutRow> = {}): CheckoutRow => ({
  session_id: 'cs_test_1',
  email: 'ann@example.com',
  status: 'complete',
  claimed_at: null,
  reminded_at: null,
  cancelled_reason: null,
  created_at: '2026-10-24T10:00:00Z',
  ...patch,
});

describe('checkout reminder', () => {
  it('is due for a completed, unclaimed checkout after an hour', () => {
    expect(isDue(row(), NOW)).toBe(true);
    expect(isDue(row({ created_at: '2026-10-24T11:30:00Z' }), NOW)).toBe(false);
  });

  it('skips claimed, reminded, cancelled, open and very old checkouts', () => {
    expect(isDue(row({ claimed_at: '2026-10-24T10:05:00Z' }), NOW)).toBe(false);
    expect(isDue(row({ reminded_at: '2026-10-24T11:00:00Z' }), NOW)).toBe(false);
    expect(isDue(row({ cancelled_reason: 'already_subscribed' }), NOW)).toBe(false);
    expect(isDue(row({ status: 'open' }), NOW)).toBe(false);
    expect(isDue(row({ email: null }), NOW)).toBe(false);
    expect(isDue(row({ created_at: '2026-10-01T10:00:00Z' }), NOW)).toBe(false);
  });

  it('links back to the success page of the checkout', () => {
    expect(accountLink('https://peakr.app/', 'cs_test_1')).toBe(
      'https://peakr.app/checkout/success?session_id=cs_test_1',
    );
  });

  it('escapes the link in the html body', () => {
    const texts = checkoutReminderTexts('https://x.test/?a=1&b="2"');
    expect(texts.html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
    expect(texts.text).toContain('https://x.test/?a=1&b="2"');
  });
});
