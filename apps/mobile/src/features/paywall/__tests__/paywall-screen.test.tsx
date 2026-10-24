import type { Session } from '@supabase/supabase-js';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useSessionStore } from '@/features/auth/session-store';
import { useBillingStore } from '@/features/billing/billing-store';
import { NO_ENTITLEMENTS } from '@/features/billing/model';
import { useCreatePlan, usePlan } from '@/features/plan/queries';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { PaywallScreen } from '../paywall-screen';

jest.mock('@/data/supabase', () => ({
  supabase: { auth: { onAuthStateChange: jest.fn() } },
}));
jest.mock('@/data/repositories/onboarding-repository');
jest.mock('@/data/repositories/baseline-repository');
jest.mock('@peakr/quiz', () => ({
  ...jest.requireActual('@peakr/quiz'),
  toPlanInput: () => ({
    ok: true,
    value: { profile: {}, goal: {}, availability: {}, startDate: '2026-10-19', hrZones: {} },
  }),
}));
jest.mock('@/features/plan/queries', () => ({
  useCreatePlan: jest.fn(),
  usePlan: jest.fn(() => ({ data: undefined })),
}));
jest.mock('@/data/repositories/billing-repository');
jest.spyOn(router, 'replace').mockImplementation(() => undefined);

const session = (isAnonymous: boolean) =>
  useSessionStore.setState({
    session: { user: { id: 'user-1', is_anonymous: isAnonymous } } as unknown as Session,
    isAnonymous,
    ready: true,
  });

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
const buyTier = jest.fn(async () => 'purchased' as const);
const restore = jest.fn(async () => true);

/** Billing loaded from the store, no subscription yet. */
const storeReady = (trialDays: number | null = 7) =>
  useBillingStore.setState({
    status: 'ready',
    entitlements: NO_ENTITLEMENTS,
    subscriptions: [],
    tierPackages: [
      { ...monthly, trialDays },
      { ...yearly, trialDays },
    ],
    devTraining: false,
    buyTier,
    restore,
  });

beforeEach(() => {
  jest.clearAllMocks();
  useBillingStore.setState({ status: 'idle', tierPackages: [], devTraining: false });
  jest.mocked(useCreatePlan).mockReturnValue({
    isPending: false,
    mutate: (_input: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.(),
  } as unknown as ReturnType<typeof useCreatePlan>);
});

describe('paywall', () => {
  it('sends an anonymous quiz user to sign-in after starting the plan', async () => {
    session(true);
    await renderWithQuery(<PaywallScreen />);
    await fireEvent.press(screen.getByText('Start plan without purchase (development)'));
    expect(router.replace).toHaveBeenCalledWith('/auth/sign-in');
  });

  it('goes straight to Today for a signed-in account', async () => {
    session(false);
    await renderWithQuery(<PaywallScreen />);
    await fireEvent.press(screen.getByText('Start plan without purchase (development)'));
    expect(router.replace).toHaveBeenCalledWith('/today');
  });
});

describe('paywall with store prices', () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date('2026-10-24T09:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate'],
    });
  });
  afterEach(() => jest.useRealTimers());

  it('names the first charge date and price and promises the reminder', async () => {
    session(false);
    storeReady();
    await renderWithQuery(<PaywallScreen />);
    expect(screen.getByTestId('paywall-charge-line')).toHaveTextContent(
      'Free until Oct 31, 2026, then CHF 59.00 / year',
    );
    expect(screen.getByText("We'll remind you one day before.")).toBeTruthy();
    expect(screen.getByText('Start 7-day free trial')).toBeTruthy();
    await fireEvent.press(screen.getByText('Monthly'));
    expect(screen.getByTestId('paywall-charge-line')).toHaveTextContent(/then CHF 7.90 \/ month/);
  });

  it('shows Training + Nutrition as coming soon, without a price', async () => {
    session(false);
    storeReady();
    await renderWithQuery(<PaywallScreen />);
    expect(screen.getByTestId('paywall-tier-plus')).toHaveTextContent(/Coming soon/);
    expect(screen.getByTestId('paywall-tier-plus')).not.toHaveTextContent(/CHF/);
  });

  it('buys the selected period, creates the plan and sends an anonymous user to sign-in', async () => {
    session(true);
    storeReady();
    await renderWithQuery(<PaywallScreen />);
    await fireEvent.press(screen.getByText('Start 7-day free trial'));
    expect(buyTier).toHaveBeenCalledWith('default:$rc_annual');
    expect(router.replace).toHaveBeenCalledWith('/auth/sign-in');
  });

  it('keeps an existing plan when someone resubscribes', async () => {
    session(false);
    storeReady();
    const mutate = jest.fn();
    jest.mocked(useCreatePlan).mockReturnValue({ isPending: false, mutate } as never);
    jest.mocked(usePlan).mockReturnValue({ data: { id: 'plan' } } as never);
    await renderWithQuery(<PaywallScreen />);
    await fireEvent.press(screen.getByText('Start 7-day free trial'));
    expect(mutate).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/today');
    jest.mocked(usePlan).mockReturnValue({ data: undefined } as never);
  });

  it('says so when the trial was already used', async () => {
    session(false);
    storeReady(null);
    await renderWithQuery(<PaywallScreen />);
    expect(screen.queryByTestId('paywall-charge-line')).toBeNull();
    expect(screen.getByText('Subscribe')).toBeTruthy();
    expect(screen.getByText(/already used your free trial/)).toBeTruthy();
  });

  it('reports when there is nothing to restore', async () => {
    session(false);
    storeReady();
    await renderWithQuery(<PaywallScreen />);
    await fireEvent.press(screen.getByText('Restore purchases'));
    expect(restore).toHaveBeenCalled();
    expect(screen.getByText('No active subscription found for this account.')).toBeTruthy();
  });
});
