import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import PricingPage from '@/app/pricing/page';

import { formatPrice, GYM_ADDON, TIERS, yearlySavingPercent } from '../plans';

describe('pricing helpers', () => {
  it('formats prices with the currency and two decimals only when needed', () => {
    expect(formatPrice(7.9)).toBe('CHF 7.90');
    expect(formatPrice(59)).toBe('CHF 59');
  });

  it('computes the yearly saving against twelve monthly payments', () => {
    expect(TIERS.map((tier) => yearlySavingPercent(tier.prices))).toEqual([38, 38]);
  });
});

describe('pricing page', () => {
  it('shows both tiers monthly by default and switches to yearly', async () => {
    render(<PricingPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Simple, fair pricing' })).toBeDefined();
    expect(screen.getByText('CHF 7.90 / month')).toBeDefined();
    expect(screen.getByText('CHF 11.90 / month')).toBeDefined();

    await userEvent.click(screen.getByRole('radio', { name: 'Yearly' }));
    expect(screen.getByText('CHF 59 / year')).toBeDefined();
    expect(screen.getByText('CHF 89 / year')).toBeDefined();
    expect(screen.getByText('That’s CHF 4.92 per month, billed yearly.')).toBeDefined();
  });

  it('marks Training + Nutrition as coming soon without a purchase link', () => {
    render(<PricingPage />);
    const plus = screen
      .getByRole('heading', { level: 2, name: 'Training + Nutrition' })
      .closest('li');
    expect(plus).not.toBeNull();
    expect(within(plus!).getAllByText('Coming soon').length).toBeGreaterThan(0);
    expect(within(plus!).queryByRole('link')).toBeNull();
  });

  it('explains the trial, has an FAQ and sends every CTA to the waitlist', () => {
    render(<PricingPage />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'How the 7-day free trial works' }),
    ).toBeDefined();
    expect(screen.getByText('Reminder one day before')).toBeDefined();
    expect(screen.getByText('How do I cancel?')).toBeDefined();
    const ctas = [
      ...screen.getAllByRole('link', { name: 'Join the waitlist' }),
      screen.getByRole('link', { name: 'Build your personal plan' }),
    ];
    expect(ctas.map((link) => link.getAttribute('href'))).toEqual([
      '/#waitlist',
      '/#waitlist',
      '/#waitlist',
    ]);
  });

  it('prices the Gym add-on as its own subscription next to the tiers', async () => {
    render(<PricingPage />);
    const addon = screen.getByRole('region', { name: 'Peakr Gym' });
    expect(within(addon).getByText('CHF 3.90 / month')).toBeDefined();
    expect(within(addon).getByText(/Cancel one without touching the other/)).toBeDefined();
    expect(within(addon).getByText(/endurance plan never depends on the add-on/)).toBeDefined();

    await userEvent.click(screen.getByRole('radio', { name: 'Yearly' }));
    expect(within(addon).getByText('CHF 29 / year')).toBeDefined();
    expect(yearlySavingPercent(GYM_ADDON.prices)).toBe(38);
  });
});
