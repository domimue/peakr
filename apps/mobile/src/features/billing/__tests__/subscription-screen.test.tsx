import { fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { renderWithQuery } from '@/test-utils/render-with-query';

import { useBillingStore } from '../billing-store';
import { NO_ENTITLEMENTS, type ActiveSubscription } from '../model';
import { SubscriptionScreen } from '../screens/subscription-screen';

jest.mock('@/data/repositories/billing-repository');

const trial: ActiveSubscription = {
  kind: 'tier',
  entitlement: 'training',
  productId: 'peakr_training',
  period: 'monthly',
  store: 'play_store',
  isTrial: true,
  willRenew: true,
  expiresAt: '2026-10-31T09:00:00Z',
  managementUrl: null,
  priceString: 'CHF 7.90',
};
const yearly = {
  id: 'default:$rc_annual',
  productId: 'peakr_training:yearly',
  period: 'yearly' as const,
  tier: 'training' as const,
  priceString: 'CHF 59.00',
  trialDays: 7,
};
const monthly = {
  ...yearly,
  id: 'default:$rc_monthly',
  productId: 'peakr_training:monthly',
  period: 'monthly' as const,
  priceString: 'CHF 7.90',
};
const plus = {
  ...yearly,
  id: 'default:plus_annual',
  productId: 'peakr_plus:yearly',
  tier: 'plus' as const,
  priceString: 'CHF 89.00',
};
const buyTier = jest.fn(async () => 'purchased' as const);

function billing(subscriptions: ActiveSubscription[], hadTraining = false) {
  useBillingStore.setState({
    status: 'ready',
    entitlements: {
      ...NO_ENTITLEMENTS,
      tier: subscriptions.length > 0 ? 'training' : 'none',
      hadTraining,
    },
    subscriptions,
    tierPackages: [monthly, yearly, plus],
    devTraining: false,
    devGym: false,
    buyTier,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

describe('Profile → Subscription', () => {
  it('shows tier, price, trial status and the first charge date', async () => {
    billing([trial]);
    await renderWithQuery(<SubscriptionScreen />);
    const card = screen.getByTestId('subscription-tier');
    expect(card).toHaveTextContent(/Training/);
    expect(card).toHaveTextContent(/CHF 7.90/);
    expect(card).toHaveTextContent(/Trial ends \(first charge\)Oct 31, 2026/);
    expect(card).toHaveTextContent(/Free trial/);
    expect(card).toHaveTextContent(/we'll remind you one day before/);
  });

  it('switches the period through the store and never offers Plus before it ships', async () => {
    billing([trial]);
    await renderWithQuery(<SubscriptionScreen />);
    expect(screen.queryByText(/Upgrade to Training \+ Nutrition/)).toBeNull();
    expect(screen.getByText('Coming soon')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Switch to yearly (CHF 59.00 / year)'));
    expect(buyTier).toHaveBeenCalledWith('default:$rc_annual');
    expect(screen.getByText('Your plan change was sent to the store.')).toBeOnTheScreen();
  });

  it('cancels on the store page of exactly this subscription', async () => {
    billing([trial]);
    await renderWithQuery(<SubscriptionScreen />);
    await fireEvent.press(screen.getByText('Cancel subscription'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://play.google.com/store/account/subscriptions?sku=peakr_training&package=com.peakr.app',
    );
  });

  it('after cancelling: access until the period end, then read-only', async () => {
    billing([{ ...trial, isTrial: false, willRenew: false }]);
    await renderWithQuery(<SubscriptionScreen />);
    expect(screen.getByTestId('subscription-tier')).toHaveTextContent(
      /until Oct 31, 2026, then it becomes read-only/,
    );
    expect(screen.queryByText(/Switch to yearly/)).toBeNull();
  });

  it('web subscriptions are managed on the website, without a link', async () => {
    billing([{ ...trial, store: 'stripe', managementUrl: 'https://billing.stripe.com/p/x' }]);
    await renderWithQuery(<SubscriptionScreen />);
    expect(screen.getByText(/bought on the website; manage it there/)).toBeOnTheScreen();
    expect(screen.queryByText('Cancel subscription')).toBeNull();
    expect(screen.queryByText(/Switch to/)).toBeNull();
  });

  it('without a subscription leads to the in-app paywall', async () => {
    billing([], true);
    await renderWithQuery(<SubscriptionScreen />);
    expect(screen.getByText(/Your subscription has ended/)).toBeOnTheScreen();
    expect(screen.getByText('See plans')).toBeOnTheScreen();
  });
});
