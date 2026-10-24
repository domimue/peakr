import { describe, expect, it } from 'vitest';

import {
  cancelLink,
  dueReminders,
  isActive,
  reminderKey,
  reminderTexts,
  rowsFromSubscriber,
  sameSecret,
  usersOfEvent,
  type EntitlementRow,
  type SubscriberResponse,
} from './index';

const USER = '6f1c2a4e-1b2c-4d5e-8f90-123456789abc';
const OTHER = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const trialSubscriber: SubscriberResponse = {
  subscriber: {
    entitlements: {
      training: { product_identifier: 'peakr_training', expires_date: '2026-10-31T09:00:00Z' },
      gym: { product_identifier: 'peakr_gym_yearly', expires_date: '2026-09-01T00:00:00Z' },
    },
    subscriptions: {
      peakr_training: {
        store: 'play_store',
        period_type: 'trial',
        expires_date: '2026-10-31T09:00:00Z',
        unsubscribe_detected_at: null,
        billing_issues_detected_at: null,
      },
      peakr_gym_yearly: {
        store: 'app_store',
        period_type: 'normal',
        expires_date: '2026-09-01T00:00:00Z',
        unsubscribe_detected_at: '2026-08-10T00:00:00Z',
      },
    },
    subscriber_attributes: {
      peakr_price: { value: 'CHF 59.00' },
      peakr_product: { value: 'peakr_training:yearly' },
    },
    management_url: 'https://play.google.com/store/account/subscriptions',
  },
};

describe('RevenueCat events', () => {
  it('names the Supabase users of an event and skips anonymous ids', () => {
    expect(
      usersOfEvent({
        event: {
          type: 'TRANSFER',
          app_user_id: '$RCAnonymousID:abc',
          transferred_from: ['$RCAnonymousID:abc'],
          transferred_to: [USER],
        },
      }),
    ).toEqual([USER]);
    expect(
      usersOfEvent({ event: { app_user_id: USER, original_app_user_id: USER, aliases: [OTHER] } }),
    ).toEqual([USER, OTHER]);
    expect(usersOfEvent({})).toEqual([]);
  });

  it('checks the webhook secret exactly', () => {
    expect(sameSecret('Bearer s3cret', 'Bearer s3cret')).toBe(true);
    expect(sameSecret('Bearer s3cre', 'Bearer s3cret')).toBe(false);
    expect(sameSecret(null, 'Bearer s3cret')).toBe(false);
    expect(sameSecret('', '')).toBe(false);
  });
});

describe('subscriber → rows', () => {
  const rows = rowsFromSubscriber(USER, trialSubscriber);

  it('stores every entitlement with store, trial, renewal and price', () => {
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      user_id: USER,
      entitlement: 'training',
      product_id: 'peakr_training',
      store: 'play_store',
      period_type: 'trial',
      will_renew: true,
      expires_at: '2026-10-31T09:00:00Z',
      price_string: 'CHF 59.00',
      management_url: 'https://play.google.com/store/account/subscriptions',
    });
    // Cancelled add-on: no renewal, and the price attribute belongs to another product.
    expect(rows[1]).toMatchObject({ entitlement: 'gym', will_renew: false, price_string: null });
  });

  it('keeps expired entitlements, which no longer grant access', () => {
    const now = new Date('2026-10-24T09:00:00Z');
    expect(isActive(rows[0] as EntitlementRow, now)).toBe(true);
    expect(isActive(rows[1] as EntitlementRow, now)).toBe(false);
    expect(isActive({ expires_at: null }, now)).toBe(true);
  });

  it('returns nothing for an unknown subscriber', () => {
    expect(rowsFromSubscriber(USER, {})).toEqual([]);
  });
});

describe('trial-ending reminder', () => {
  const row = rowsFromSubscriber(USER, trialSubscriber)[0] as EntitlementRow;

  it('is due within the last 24 hours of the trial, once', () => {
    expect(dueReminders([row], new Set(), new Date('2026-10-30T08:00:00Z'))).toEqual([]);
    const due = dueReminders([row], new Set(), new Date('2026-10-30T09:30:00Z'));
    expect(due).toHaveLength(1);
    const sent = new Set(due.map(reminderKey));
    expect(dueReminders([row], sent, new Date('2026-10-30T10:30:00Z'))).toEqual([]);
    // After the charge it is too late.
    expect(dueReminders([row], new Set(), new Date('2026-10-31T10:00:00Z'))).toEqual([]);
  });

  it('skips cancelled trials and paid periods', () => {
    const now = new Date('2026-10-30T12:00:00Z');
    expect(dueReminders([{ ...row, will_renew: false }], new Set(), now)).toEqual([]);
    expect(dueReminders([{ ...row, period_type: 'normal' }], new Set(), now)).toEqual([]);
  });

  it('sends one reminder for Plus, which grants two entitlements', () => {
    const plus = { ...row, product_id: 'peakr_plus', entitlement: 'plus' as const };
    const due = dueReminders(
      [{ ...plus, entitlement: 'training' }, plus],
      new Set(),
      new Date('2026-10-30T12:00:00Z'),
    );
    expect(due).toHaveLength(1);
    expect(due[0]?.entitlement).toBe('plus');
  });

  it('names the charge date, the amount and the cancel link', () => {
    const [reminder] = dueReminders([row], new Set(), new Date('2026-10-30T12:00:00Z'));
    if (!reminder) throw new Error('no reminder');
    const texts = reminderTexts(reminder, 'https://peakr.ch');
    expect(texts.push.body).toBe(
      'Peakr Training: CHF 59.00 on 31 October 2026. Cancel anytime before then in Google Play.',
    );
    expect(texts.email.subject).toBe(
      'Your Peakr trial ends tomorrow – CHF 59.00 on 31 October 2026',
    );
    expect(texts.email.text).toContain('https://play.google.com/store/account/subscriptions');
    expect(texts.email.html).toContain(
      '<a href="https://play.google.com/store/account/subscriptions">',
    );
  });

  it('sends web subscribers to the account page on the website', () => {
    const [reminder] = dueReminders(
      [{ ...row, store: 'stripe', management_url: null }],
      new Set(),
      new Date('2026-10-30T12:00:00Z'),
    );
    if (!reminder) throw new Error('no reminder');
    expect(cancelLink(reminder, 'https://peakr.ch/')).toBe('https://peakr.ch/account');
    expect(cancelLink({ ...reminder, store: 'play_store' }, null)).toBe(
      'https://play.google.com/store/account/subscriptions?sku=peakr_training&package=com.peakr.app',
    );
  });
});
