import { afterEach, describe, expect, it, vi } from 'vitest';

import { confirmationTexts, sendCheckoutConfirmation } from '../confirmation-email';
import { fakeSupabase } from './fake-supabase';

vi.mock('server-only', () => ({}));

afterEach(() => vi.unstubAllEnvs());

describe('confirmationTexts', () => {
  it('names the charge date and carries the app link and the account link', () => {
    const texts = confirmationTexts({
      openUrl: 'https://open.peakr.example/open?from=email',
      accountUrl: 'https://peakr.example/checkout/success?session_id=cs_1',
      manageUrl: 'https://peakr.example/account',
      trialEnd: '2026-11-01T10:00:00Z',
    });
    expect(texts.subject).toBe('Your Peakr trial has started – get the app');
    expect(texts.text).toContain('November 1, 2026');
    expect(texts.text).toContain('https://open.peakr.example/open?from=email');
    expect(texts.html).toContain(
      '<a href="https://open.peakr.example/open?from=email">Open Peakr</a>',
    );
    expect(texts.html).toContain('session_id=cs_1');
  });
});

describe('sendCheckoutConfirmation', () => {
  const checkout = { sessionId: 'cs_1', email: 'a@b.example', trialEnd: null };

  it('sends once: only the call that claims `confirmed_at` sends', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://peakr.example');
    const send = vi.fn(async () => undefined);
    const { client, calls } = fakeSupabase({
      'web_checkouts:update': { data: [{ session_id: 'cs_1' }], error: null },
    });
    expect(await sendCheckoutConfirmation(client as never, checkout, { send })).toBe(true);
    expect(calls[0]?.filters).toContainEqual(['is', 'confirmed_at', null]);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.example', subject: 'Welcome to Peakr – get the app' }),
    );

    const { client: second } = fakeSupabase({ 'web_checkouts:update': { data: [], error: null } });
    send.mockClear();
    expect(await sendCheckoutConfirmation(second as never, checkout, { send })).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('releases the claim when sending fails, without throwing', async () => {
    const send = vi.fn(async () => {
      throw new Error('down');
    });
    const { client, calls } = fakeSupabase({
      'web_checkouts:update': { data: [{ session_id: 'cs_1' }], error: null },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await sendCheckoutConfirmation(client as never, checkout, { send })).toBe(false);
    expect(calls[1]?.payload).toEqual({ confirmed_at: null });
  });

  it('does nothing without an email provider', async () => {
    const { client, calls } = fakeSupabase();
    expect(await sendCheckoutConfirmation(client as never, checkout, null)).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
