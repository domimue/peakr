import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DeleteAccountPage from '@/app/delete-account/page';
import ImprintPage from '@/app/imprint/page';
import PrivacyPage from '@/app/privacy/page';
import TermsPage from '@/app/terms/page';
import { messages } from '@/i18n';

describe('legal pages', () => {
  it.each([
    ['Legal notice', ImprintPage],
    ['Privacy policy', PrivacyPage],
    ['Terms of service', TermsPage],
  ])('%s is marked as a draft', (title, Page) => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeDefined();
    expect(screen.getByRole('complementary', { name: 'Draft' })).toBeDefined();
  });

  it('privacy policy covers account, sync, Strava, push, payments and consent', () => {
    render(<PrivacyPage />);
    for (const heading of [
      'Your account',
      'Training plan and sync',
      'Strava',
      'Push notifications',
      'Payments (planned)',
      'Cookies and analytics',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeDefined();
    }
    expect(screen.getByText(/never used to train artificial intelligence/)).toBeDefined();
    expect(screen.getByText(/stored separately as reference data only/)).toBeDefined();
    expect(screen.getByText(/only load after you have given your consent/)).toBeDefined();
  });

  it('terms cover trial, renewal, cancellation, withdrawal and Swiss law', () => {
    render(<TermsPage />);
    for (const heading of [
      'Provider',
      '7-day free trial',
      'Automatic renewal',
      'Cancellation',
      'Right of withdrawal',
      'Applicable law and jurisdiction',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeDefined();
    }
    expect(screen.getByText(/Swiss law applies/)).toBeDefined();
  });

  it('delete-account page explains the in-app and website steps, email request and store subscriptions', () => {
    render(<DeleteAccountPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Delete your Peakr account' }),
    ).toBeDefined();
    expect(screen.getByText('Go to Profile → Account.')).toBeDefined();
    const email = messages.legal.operator.email;
    expect(screen.getByRole('link', { name: email }).getAttribute('href')).toBe(`mailto:${email}`);
    expect(
      screen.getByRole('link', { name: 'Delete my account on the website' }).getAttribute('href'),
    ).toBe('/account/delete');
    expect(screen.getByText(/revoke Peakr’s access to Strava, Garmin/)).toBeDefined();
    expect(screen.getByText(/Push notification tokens/)).toBeDefined();
    expect(
      screen.getByText(/does not cancel a subscription you bought in Google Play/),
    ).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Open Google Play subscriptions' }).getAttribute('href'),
    ).toBe('https://play.google.com/store/account/subscriptions');
    expect(screen.queryByRole('complementary', { name: 'Draft' })).toBeNull();
  });
});
