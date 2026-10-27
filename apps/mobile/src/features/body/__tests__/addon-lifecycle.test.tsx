import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useRemoteFlagsStore } from '@/config/remote-flags';
import * as ids from '@/data/ids';
import * as bodyRepo from '@/data/repositories/body-repository';
import * as planRepo from '@/data/repositories/plan-repository';
import { useBillingStore } from '@/features/billing/billing-store';
import { entitlementsOf, subscriptionsOf, type CustomerInfoLike } from '@/features/billing/model';
import { SubscriptionScreen } from '@/features/billing/screens/subscription-screen';
import { shareFile } from '@/features/sharing/share-file';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { BodyAddonScreen } from '../screens/body-addon-screen';
import { BodyScreen } from '../screens/body-screen';
import { NutritionScreen } from '../screens/nutrition-screen';

jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    ...jest.requireActual('expo-router'),
    Redirect: ({ href }: { href: string }) => <RNText>{`redirect:${href}`}</RNText>,
  };
});
jest.mock('@/features/sharing/share-file', () => ({
  shareFile: jest.fn(async () => 'shared'),
}));
jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/route-repository');
jest.mock('@/data/repositories/billing-repository');
jest.mock('@/data/repositories/baseline-repository');

const body = bodyRepo as unknown as typeof import('@/data/repositories/__mocks__/body-repository');
const plan = planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');

/** Tuesday. */
const TODAY = '2026-10-27';
const shift = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const ent = (productIdentifier: string, over: Record<string, unknown> = {}) => ({
  productIdentifier,
  store: 'PLAY_STORE',
  periodType: 'NORMAL',
  willRenew: true,
  expirationDate: '2026-12-01T00:00:00Z',
  ...over,
});

function info(state: 'none' | 'active' | 'cancelled' | 'expired'): CustomerInfoLike {
  const training = ent('peakr_training');
  const addon =
    state === 'cancelled'
      ? ent('peakr_body', { willRenew: false })
      : state === 'expired'
        ? ent('peakr_body', { willRenew: false, expirationDate: '2026-10-01T00:00:00Z' })
        : ent('peakr_body');
  const active = state === 'active' || state === 'cancelled';
  return {
    entitlements: {
      active: { training, ...(active ? { body_nutrition: addon } : {}) },
      all: { training, ...(state !== 'none' ? { body_nutrition: addon } : {}) },
    },
    managementURL: 'https://play.google.com/store/account/subscriptions',
  };
}

function billing(state: 'none' | 'active' | 'cancelled' | 'expired') {
  const i = info(state);
  useRemoteFlagsStore.setState({ flags: { addon_body_nutrition: true }, loaded: true });
  useBillingStore.setState({
    status: 'ready',
    entitlements: entitlementsOf(i),
    subscriptions: subscriptionsOf(i),
    devBody: false,
    devTraining: false,
    cachedAddon: null,
    bodyTrialUsed: state !== 'none',
  });
}

/** Five weeks of daily weigh-ins losing ~0.5 kg a week, food logged on most days. */
function seed() {
  body.store.profile = { sex: 'male', birthDate: '1990-05-01', heightCm: 180, weightKg: 84 };
  body.store.checkIns = Array.from({ length: 36 }, (_, i) => ({
    id: `w${i}`,
    day: shift(TODAY, i - 35),
    weightKg: Math.round((84 - (i * 0.5) / 7 + (i % 3) * 0.2) * 10) / 10,
    waistCm: null,
    bodyFatPct: null,
    note: null,
    createdAt: `${shift(TODAY, i - 35)}T07:00:00Z`,
  }));
  body.store.food = Array.from({ length: 35 }, (_, i) => ({
    id: `f${i}`,
    day: shift(TODAY, i - 35),
    meal: 'lunch' as const,
    name: 'Day total',
    kcal: 2100,
    proteinG: 120,
    carbsG: 220,
    fatG: 70,
    foodId: null,
    amount: null,
    unit: null,
    portionLabel: null,
    createdAt: '',
  }));
  body.store.measurements = [
    {
      id: 'm1',
      day: shift(TODAY, -35),
      values: { waist: 92, hip: 102, neck: 39 },
      bodyFatPct: 22,
      bodyFatSource: 'manual',
      note: null,
      photos: {},
      createdAt: '',
    },
    {
      id: 'm2',
      day: shift(TODAY, -1),
      values: { waist: 89.5, hip: 101 },
      bodyFatPct: 20.5,
      bodyFatSource: 'navy',
      note: null,
      photos: {},
      createdAt: '',
    },
  ];
  body.store.goals = [
    {
      id: 'g1',
      createdAt: `${shift(TODAY, -35)}T08:00:00Z`,
      kind: 'lose',
      startWeightKg: 84,
      targetWeightKg: 78,
      ratePerWeekKg: 0.5,
      eatBackPct: 50,
      weeklyMode: false,
      adjustmentKcal: 0,
      paused: false,
      reason: 'user',
    },
  ];
}

const billingInitial = useBillingStore.getState();
const flagsInitial = useRemoteFlagsStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useBillingStore.setState(billingInitial, true);
  useRemoteFlagsStore.setState(flagsInitial, true);
  body.resetStore();
  plan.store.plan = null;
  jest.spyOn(ids, 'todayIso').mockReturnValue(TODAY);
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'replace').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

/** Lets the screens' start-up effects (store hydration, queries) finish before interacting. */
async function render(ui: React.ReactElement) {
  await renderWithQuery(ui);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

describe('restore and cancelling, end to end', () => {
  // The store's RevenueCat step is stubbed (the client loads lazily, which Jest cannot run);
  // everything after it – entitlements, guard, screens – is the real code.
  let answer = info('none');
  const fromStore = () =>
    useBillingStore.setState({
      entitlements: entitlementsOf(answer),
      subscriptions: subscriptionsOf(answer),
    });

  beforeEach(() => {
    billing('none');
    seed();
    useBillingStore.setState({
      bodyPackages: [
        {
          id: 'body:yearly',
          productId: 'peakr_body:yearly',
          period: 'yearly',
          tier: null,
          price: 39,
          priceString: 'CHF 39.00',
          trialDays: 14,
        },
      ] as never,
      restore: jest.fn(async () => {
        fromStore();
        return true;
      }),
      refresh: jest.fn(async () => {
        fromStore();
      }),
    });
  });

  it('restore on a new phone finds the add-on and unlocks Body', async () => {
    answer = info('active');
    await render(<BodyAddonScreen />);
    await fireEvent.press(await screen.findByText('Restore purchases'));
    expect(await screen.findByText('Purchases restored.')).toBeOnTheScreen();
    expect(useBillingStore.getState().entitlements.body).toBe(true);
    expect(useBillingStore.getState().restore).toHaveBeenCalledTimes(1);
  });

  it('cancelled: still usable until the period ends, and the subscription screen says so', async () => {
    answer = info('cancelled');
    await useBillingStore.getState().refresh();
    await render(<SubscriptionScreen />);
    expect(await screen.findByText(/Cancelled\. Peakr Body stays active until/)).toBeOnTheScreen();
  });

  it('cancelled: new check-ins still work', async () => {
    answer = info('cancelled');
    await useBillingStore.getState().refresh();
    await render(<BodyScreen focus="checkIn" />);
    expect(await screen.findByTestId('body-new-check-in')).toBeOnTheScreen();
  });

  it('ended: everything readable and exportable, the coach without actions', async () => {
    answer = info('expired');
    await useBillingStore.getState().refresh();
    await render(<NutritionScreen />);
    expect(await screen.findByTestId('body-read-only')).toBeOnTheScreen();
    expect(await screen.findByTestId('body-coach')).toBeOnTheScreen();
    expect(screen.queryByTestId('coach-apply-kcal')).toBeNull();
    await fireEvent.press(screen.getByText('Export as CSV'));
    await waitFor(() => expect(shareFile).toHaveBeenCalled());
  });

  it('ended: the history stays, new check-ins are locked', async () => {
    answer = info('expired');
    await useBillingStore.getState().refresh();
    await render(<BodyScreen focus="checkIn" />);
    expect(await screen.findByTestId(`history-${shift(TODAY, -1)}`)).toBeOnTheScreen();
    expect(screen.queryByTestId('body-new-check-in')).toBeNull();
  });
});
