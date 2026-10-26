import { generatePlan } from '@peakr/engine';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useRemoteFlagsStore } from '@/config/remote-flags';
import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as bodyRepo from '@/data/repositories/body-repository';
import * as planRepo from '@/data/repositories/plan-repository';
import { useBillingStore } from '@/features/billing/billing-store';
import {
  entitlementsOf,
  NO_ENTITLEMENTS,
  subscriptionsOf,
  type CustomerInfoLike,
} from '@/features/billing/model';
import { SubscriptionScreen } from '@/features/billing/screens/subscription-screen';
import { PaywallScreen } from '@/features/paywall/paywall-screen';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { BodyScreen } from '../screens/body-screen';

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

const input: StoredPlanInput = {
  profile: {
    age: 35,
    experience: 'intermediate',
    sports: ['run', 'bike'],
    terrain: 'flat',
    strength: { mode: 'none' },
  },
  goal: { kind: 'half' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  targetDate: '2027-02-14',
  hrZones: { age: 35, restingHr: 55 },
};

function storePlan() {
  const r = generatePlan(
    input.profile,
    input.goal,
    input.availability,
    shift(TODAY, -15),
    '2027-02-14',
  );
  if (!r.ok) throw new Error('plan');
  plan.store.plan = {
    id: 'plan-1',
    input,
    state: { plan: r.value, status: {}, pauses: [], revision: 0 },
  };
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

describe('Body dashboard', () => {
  it('shows KPIs, charts, balance, composition, indices, measurements and training', async () => {
    billing('active');
    seed();
    storePlan();
    await render(<BodyScreen initial="progress" />);
    expect(await screen.findByTestId('body-kpis')).toBeOnTheScreen();
    expect(screen.getByTestId('kpi-trend')).toHaveTextContent(/\d+(\.\d)? kg/);
    expect(screen.getByTestId('kpi-start')).toHaveTextContent(/-\d/);
    expect(screen.getByTestId('kpi-fat')).toHaveTextContent(/^20\.5 %/);
    expect(screen.getByTestId('kpi-waist')).toHaveTextContent(/^89\.5 cm/);
    expect(screen.getByTestId('kpi-goal')).toHaveTextContent(/\d+ %/);

    expect(screen.getByTestId('body-trend-chart')).toBeOnTheScreen();
    expect(screen.getByText('At your chosen rate')).toBeOnTheScreen();
    expect(screen.getByTestId('body-energy-chart')).toBeOnTheScreen();
    expect(screen.getByTestId(`balance-${shift(TODAY, -8)}`)).toHaveTextContent(
      /kcal (deficit|surplus) · ≈ [-+]?\d/,
    );
    expect(screen.getByTestId('body-composition')).toHaveTextContent(/estimate/i);
    expect(screen.getByTestId('body-indices')).toHaveTextContent(/BMI/);
    expect(screen.getByTestId('body-indices')).toHaveTextContent(/0\.5/);
    expect(screen.getByTestId('body-measurements')).toHaveTextContent(
      /Waist \(narrowest\)89\.5 cm \(-2\.5 since/,
    );
    expect(screen.getByTestId('body-training')).toHaveTextContent(/Runs\d of \d/);
  });

  it('the coach summarises last week and suggests next steps from the engine', async () => {
    billing('active');
    seed();
    storePlan();
    await render(<BodyScreen initial="progress" />);
    const coach = await screen.findByTestId('body-coach');
    expect(coach).toHaveTextContent(/Looking back on the week of Oct 19/);
    expect(screen.getByTestId('coach-progress')).toHaveTextContent(/% of the way to your goal/);
    expect(screen.getByTestId('coach-numbers')).toHaveTextContent(/Logged 7 of 7 days/);
    expect(screen.getByTestId('coach-well')).toHaveTextContent(/You logged 7 of 7 days/);
    // 120 g against the goal's protein target (≥ 1.6 g/kg) → protein is the suggestion.
    expect(screen.getByTestId('coach-adjustments')).toHaveTextContent(/g protein a day/);
    expect(coach).toHaveTextContent(/nothing changes until you accept it/);
  });

  it('applies a too-fast-loss suggestion only on tap, as an adaptive goal change', async () => {
    billing('active');
    seed();
    // Six weeks falling ~2 kg a week (the trend lags, so it needs the history): too fast.
    body.store.checkIns = Array.from({ length: 43 }, (_, i) => ({
      id: `w${i}`,
      day: shift(TODAY, i - 42),
      weightKg: Math.round((92 - (i * 2) / 7) * 10) / 10,
      waistCm: null,
      bodyFatPct: null,
      note: null,
      createdAt: '',
    }));
    await render(<BodyScreen initial="progress" />);
    await screen.findByTestId('body-coach');
    expect(screen.getByTestId('coach-hint-tooFastLoss')).toBeOnTheScreen();
    expect(body.store.goals).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('coach-apply-kcal'));
    await waitFor(() => expect(body.store.goals).toHaveLength(2));
    expect(body.store.goals[1]).toEqual(
      expect.objectContaining({ adjustmentKcal: 150, reason: 'adaptive' }),
    );
  });

  it('with little data: says so instead of guessing', async () => {
    billing('active');
    body.store.profile = { sex: 'female', birthDate: '1992-01-01', heightCm: 166, weightKg: 62 };
    await render(<BodyScreen initial="progress" />);
    expect(await screen.findByTestId('coach-hint-incompleteData')).toBeOnTheScreen();
    expect(screen.getByTestId('body-measurements')).toHaveTextContent(/start with the first/);
    expect(screen.getByTestId('kpi-goal')).toHaveTextContent(/^–/);
  });
});

describe('paywall with the add-on', () => {
  const pkg = (tier: 'training' | 'plus' | null, period: 'monthly' | 'yearly', price: number) => ({
    id: `${tier ?? 'body'}:${period}`,
    productId: `${tier ?? 'body'}:${period}`,
    period,
    tier,
    price,
    priceString: `CHF ${price.toFixed(2)}`,
    trialDays: tier ? 7 : 14,
  });

  function offer(trialUsed: boolean | null) {
    useRemoteFlagsStore.setState({ flags: { addon_body_nutrition: true }, loaded: true });
    useBillingStore.setState({
      status: 'ready',
      entitlements: NO_ENTITLEMENTS,
      subscriptions: [],
      devTraining: false,
      devBody: false,
      bodyTrialUsed: trialUsed,
      tierPackages: [pkg('training', 'yearly', 59), pkg('plus', 'yearly', 89)] as never,
      bodyPackages: [pkg(null, 'yearly', 39)] as never,
    });
  }

  it('lists the add-on with features, price and trial, and offers the bundle', async () => {
    offer(false);
    await render(<PaywallScreen />);
    const section = await screen.findByTestId('paywall-addon');
    expect(section).toHaveTextContent(/Add-on: CHF 39.00 \/ year/);
    expect(section).toHaveTextContent(/14 days free, once per account/);
    expect(section).toHaveTextContent(/Food diary with barcode scan/);
    expect(section).toHaveTextContent(/weekly coach/);
    await fireEvent.press(screen.getByTestId('paywall-choose-bundle'));
    await waitFor(() =>
      expect(screen.getByTestId('paywall-tier-plus')).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ selected: true }),
      ),
    );
    // The bundle includes Body: no separate add-on section any more.
    expect(screen.queryByTestId('paywall-addon')).toBeNull();
  });

  it('offers no second add-on trial', async () => {
    offer(true);
    await render(<PaywallScreen />);
    expect(await screen.findByTestId('paywall-addon')).toHaveTextContent(/Renews automatically/);
  });

  it('every entry point leads to the add-on paywall', async () => {
    billing('none');
    await render(<BodyScreen />);
    await fireEvent.press(await screen.findByText('Unlock the Body add-on'));
    expect(router.push).toHaveBeenLastCalledWith('/body/addon');
    screen.unmount();
    await render(<SubscriptionScreen />);
    await fireEvent.press(await screen.findByText('Get the Body add-on'));
    expect(router.push).toHaveBeenLastCalledWith('/body/addon');
  });
});
