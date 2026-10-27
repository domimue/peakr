import { generatePlan } from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useRemoteFlagsStore } from '@/config/remote-flags';
import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as bodyRepo from '@/data/repositories/body-repository';
import * as onboardingRepo from '@/data/repositories/onboarding-repository';
import * as planRepo from '@/data/repositories/plan-repository';
import { useBillingStore } from '@/features/billing/billing-store';
import { entitlementsOf, subscriptionsOf, type CustomerInfoLike } from '@/features/billing/model';
import { PlanScreen } from '@/features/plan/screens/plan-screen';
import { TodayScreen } from '@/features/today/today-screen';
import { shareFile } from '@/features/sharing/share-file';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { bodyCsv } from '../export';
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
jest.mock('@/data/repositories/activity-repository');
jest.mock('@/data/repositories/route-repository');
jest.mock('@/data/repositories/billing-repository');

const body = bodyRepo as unknown as typeof import('@/data/repositories/__mocks__/body-repository');
const plan = planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');
const quiz =
  onboardingRepo as unknown as typeof import('@/data/repositories/__mocks__/onboarding-repository');

const TODAY = '2026-10-19';
const input: StoredPlanInput = {
  profile: {
    age: 35,
    experience: 'intermediate',
    sports: ['run'],
    terrain: 'flat',
    strength: { mode: 'none' },
  },
  goal: { kind: 'half' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  targetDate: '2027-02-14',
  hrZones: { age: 35, restingHr: 55 },
};

function storePlan() {
  const r = generatePlan(input.profile, input.goal, input.availability, TODAY, '2027-02-14');
  if (!r.ok) throw new Error('plan');
  plan.store.plan = {
    id: 'plan-1',
    input,
    state: { plan: r.value, status: {}, pauses: [], revision: 0 },
  };
}

const sub = (over: Record<string, unknown> = {}) => ({
  productIdentifier: 'peakr_body',
  store: 'PLAY_STORE',
  periodType: 'NORMAL',
  willRenew: true,
  expirationDate: '2026-11-19T00:00:00Z',
  ...over,
});
const training = sub({ productIdentifier: 'peakr_training' });

type Body = 'never' | 'active' | 'trial' | 'cancelled' | 'expired';

/** Release billing (no dev grants) with the training tier and the given add-on state. */
function billing(state: Body, { flag = true }: { flag?: boolean } = {}) {
  const active: CustomerInfoLike['entitlements']['active'] = { training };
  const all: Record<string, unknown> = { training };
  if (state === 'active') active.body_nutrition = sub();
  if (state === 'trial') active.body_nutrition = sub({ periodType: 'TRIAL' });
  if (state === 'cancelled') active.body_nutrition = sub({ willRenew: false });
  if (state === 'expired') all.body_nutrition = sub();
  Object.assign(all, active);
  const info: CustomerInfoLike = { entitlements: { active, all }, managementURL: null };
  useRemoteFlagsStore.setState({ flags: { addon_body_nutrition: flag }, loaded: true });
  useBillingStore.setState({
    status: 'ready',
    entitlements: entitlementsOf(info),
    subscriptions: subscriptionsOf(info),
    devBody: false,
    devTraining: false,
    cachedAddon: null,
  });
}

const fullProfile = () => {
  body.store.profile = { sex: 'female', birthDate: '1991-03-14', heightCm: 168, weightKg: 61 };
};

beforeEach(() => {
  jest.clearAllMocks();
  body.resetStore();
  plan.resetStore();
  quiz.resetStore();
  jest.spyOn(ids, 'todayIso').mockReturnValue(TODAY);
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('Body tab', () => {
  it('locked: blurred sample, benefits and the way to the add-on paywall', async () => {
    billing('never');
    await renderWithQuery(<NutritionScreen />);
    expect(screen.getByTestId('body-locked')).toBeOnTheScreen();
    expect(screen.getByTestId('body-sample', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText(/Food diary: everything you eat/)).toBeOnTheScreen();
    expect(screen.queryByTestId('body-diary')).toBeNull();
    await fireEvent.press(screen.getByText('Unlock the Body add-on'));
    expect(router.push).toHaveBeenCalledWith('/body/addon');
    // Nothing of the user's add-on data was read.
    expect(body.listFood).not.toHaveBeenCalled();
  });

  it('switched off remotely: "coming soon", even with the add-on bought', async () => {
    billing('active', { flag: false });
    await renderWithQuery(<NutritionScreen />);
    expect(screen.getByTestId('nutrition-soon')).toBeOnTheScreen();
    await renderWithQuery(<BodyScreen />);
    expect(screen.getByTestId('body-soon')).toBeOnTheScreen();
  });

  it('asks inline only for the profile values that are missing', async () => {
    billing('active');
    quiz.store.progress = {
      answers: { 'body.sex': 'female', 'body.heightCm': 168, 'body.weightKg': 61 },
      stepId: null,
      insight: false,
      finished: true,
    };
    await renderWithQuery(<NutritionScreen />);
    expect(await screen.findByTestId('body-profile-setup')).toBeOnTheScreen();
    expect(screen.getByText('Birth date')).toBeOnTheScreen();
    expect(screen.queryByText('Height')).toBeNull();
    expect(screen.queryByText('Sex (for the energy formula)')).toBeNull();
  });

  it('active: logging food updates Energy today', async () => {
    billing('active');
    fullProfile();
    await renderWithQuery(<NutritionScreen />);
    // Resting 1324 × 1.3 everyday activity (desk job until answered) = 1721; no plan, no training.
    expect(await screen.findByText('1721 kcal left')).toBeOnTheScreen();
    expect(screen.getByTestId('target-breakdown')).toHaveTextContent(/Resting energy1324 kcal/);
    expect(screen.getByTestId('target-everyday-unset')).toBeOnTheScreen();
    // Quick add: kcal only.
    await fireEvent.changeText(screen.getByLabelText('Energy'), '400');
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(body.addFood).toHaveBeenCalled());
    expect(await screen.findByText('1321 kcal left')).toBeOnTheScreen();
    expect(body.store.food).toEqual([
      expect.objectContaining({ meal: 'snack', kcal: 400, proteinG: null, name: 'Quick add' }),
    ]);
  });

  it('trial: everything, with a note that nothing is charged yet', async () => {
    billing('trial');
    fullProfile();
    await renderWithQuery(<NutritionScreen />);
    expect(await screen.findByTestId('body-quick-add')).toBeOnTheScreen();
    expect(screen.getByText(/Free trial/)).toBeOnTheScreen();
  });

  it('cancelled but paid up: still fully usable', async () => {
    billing('cancelled');
    fullProfile();
    await renderWithQuery(<NutritionScreen />);
    expect(await screen.findByTestId('body-quick-add')).toBeOnTheScreen();
    expect(screen.queryByTestId('body-read-only')).toBeNull();
  });

  it('expired: history stays readable and exportable, new entries are locked', async () => {
    billing('expired');
    fullProfile();
    body.store.food = [
      {
        id: 'f1',
        day: TODAY,
        meal: 'lunch',
        name: 'Rice bowl',
        kcal: 650,
        proteinG: null,
        carbsG: null,
        fatG: null,
        foodId: null,
        amount: null,
        unit: null,
        portionLabel: null,
        createdAt: '2026-10-19T12:00:00Z',
      },
    ];
    await renderWithQuery(<NutritionScreen />);
    expect(await screen.findByText('Rice bowl')).toBeOnTheScreen();
    expect(screen.getByTestId('body-read-only')).toBeOnTheScreen();
    expect(screen.queryByTestId('body-quick-add')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();

    await renderWithQuery(<BodyScreen focus="checkIn" />);
    expect(await screen.findByTestId('body-check-in')).toBeOnTheScreen();
    expect(screen.queryByText('Save check-in')).toBeNull();

    await fireEvent.press(screen.getByText('Export as CSV'));
    await waitFor(() =>
      expect(shareFile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'peakr-body-2026-10-19.csv', mime: 'text/csv' }),
      ),
    );

    await fireEvent.press(screen.getByText('Reactivate Body'));
    expect(router.push).toHaveBeenCalledWith('/body/addon');
  });

  it('progress shows the smoothed trend', async () => {
    billing('active');
    fullProfile();
    body.store.checkIns = [
      {
        id: 'c1',
        day: '2026-10-10',
        weightKg: 62,
        waistCm: null,
        bodyFatPct: null,
        note: null,
        createdAt: 'x',
      },
      {
        id: 'c2',
        day: '2026-10-19',
        weightKg: 61,
        waistCm: null,
        bodyFatPct: null,
        note: null,
        createdAt: 'y',
      },
    ];
    await renderWithQuery(<BodyScreen />);
    // A 9-day gap counts as nine trend steps: 62 − (1 − 0.9^9) × 1 ≈ 61.4.
    expect(await screen.findByText('61.4 kg')).toBeOnTheScreen();
    expect(screen.getByTestId('body-tdee')).toHaveTextContent(/Needs 14 days/);
    expect(screen.getByTestId('body-composition')).toHaveTextContent(/Not enough data/);
    expect(screen.getByTestId('body-scale')).toHaveTextContent(/at least one complete week/);
    // The coach lives in Nutrition now.
    expect(screen.queryByTestId('body-coach')).toBeNull();
  });
});

describe('Phase 12: energy model in the app', () => {
  it('device intake counts when nothing was logged, and a day can be marked incomplete', async () => {
    billing('active');
    fullProfile();
    body.store.device = [
      { metric: 'intake_kcal', day: TODAY, source: 'healthConnect', value: 900, recordedAt: 'x' },
      { metric: 'resting_kcal', day: TODAY, source: 'healthConnect', value: 1400, recordedAt: 'x' },
      { metric: 'steps', day: TODAY, source: 'healthConnect', value: 10000, recordedAt: 'x' },
    ];
    await renderWithQuery(<NutritionScreen />);
    // The target is stable: resting energy of the last 14 days (formula 1324) × 1.3 = 1721;
    // today's steps stay in the energy model, they do not move the target. − 900 eaten.
    expect(await screen.findByText('821 kcal left')).toBeOnTheScreen();
    expect(screen.getByText(/Intake from Health Connect/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('body-day-incomplete'));
    await waitFor(() => expect(body.store.incompleteDays).toEqual([TODAY]));
    expect(await screen.findByText(/left out of your maintenance estimate/)).toBeOnTheScreen();
  });

  it('a body fat % from a check-in gives fat and lean mass', async () => {
    billing('active');
    fullProfile();
    body.store.checkIns = [
      {
        id: 'c1',
        day: '2026-10-18',
        weightKg: 61,
        waistCm: null,
        bodyFatPct: 25,
        note: null,
        createdAt: 'x',
      },
    ];
    await renderWithQuery(<BodyScreen />);
    expect(await screen.findByText('Now: 15.3 kg fat · 45.8 kg lean mass')).toBeOnTheScreen();
  });

  it('asks for Health Connect only while the add-on is active', async () => {
    billing('expired');
    fullProfile();
    await renderWithQuery(<NutritionScreen />);
    expect(await screen.findByTestId('body-read-only')).toBeOnTheScreen();
    expect(screen.queryByTestId('body-health-link')).toBeNull();
  });
});

describe('add-on paywall', () => {
  const pkg = (over: Record<string, unknown>) => ({
    id: 'x',
    productId: 'x',
    period: 'yearly' as const,
    tier: null,
    priceString: '',
    trialDays: 14,
    ...over,
  });

  function offers(trialUsed: boolean | null) {
    useBillingStore.setState({
      bodyPackages: [
        pkg({ id: 'body:y', productId: 'peakr_body', priceString: 'CHF 39.00', price: 39 }),
      ],
      tierPackages: [
        pkg({
          id: 'default:t',
          tier: 'training',
          priceString: 'CHF 59.00',
          price: 59,
          trialDays: 7,
        }),
        pkg({ id: 'default:p', tier: 'plus', priceString: 'CHF 89.00', price: 89, trialDays: 7 }),
      ],
      bodyTrialUsed: trialUsed,
    });
  }

  it('offers the 14-day trial once per account, and the bundle with its saving', async () => {
    billing('never');
    offers(false);
    const { unmount } = await renderWithQuery(<BodyAddonScreen />);
    expect(screen.getByText('Start 14-day free trial')).toBeOnTheScreen();
    expect(screen.getByTestId('body-bundle-offer')).toBeOnTheScreen();
    expect(screen.getByText('Save 9 %')).toBeOnTheScreen();
    await unmount();

    offers(true);
    await renderWithQuery(<BodyAddonScreen />);
    expect(screen.queryByText(/Start 14-day free trial/)).toBeNull();
    expect(screen.getByText('Subscribe')).toBeOnTheScreen();
  });

  it('reactivation after it ended keeps everything', async () => {
    billing('expired');
    offers(true);
    await renderWithQuery(<BodyAddonScreen />);
    expect(screen.getByText(/everything you logged is still here/)).toBeOnTheScreen();
  });
});

describe('Teil A without the add-on', () => {
  it('Today without the add-on switched on: no Body card, the session as always', async () => {
    storePlan();
    billing('never', { flag: false });
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByTestId('week-strip')).toBeOnTheScreen();
    expect(screen.queryByTestId('energy-today')).toBeNull();
    expect(screen.queryByTestId('energy-today-locked')).toBeNull();
    expect(screen.queryByTestId('coach-teaser')).toBeNull();
    expect(screen.getByText('Mark as done')).toBeOnTheScreen();
    expect(body.getProfile).not.toHaveBeenCalled();
  });

  it('Today with the add-on switched on but not bought: a locked preview card, nothing else changes', async () => {
    storePlan();
    billing('never');
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByTestId('energy-today-locked')).toBeOnTheScreen();
    expect(screen.getByText('Mark as done')).toBeOnTheScreen();
    expect(body.listFood).not.toHaveBeenCalled();
    // The coach teaser below the weekly summary leads to the add-on paywall.
    expect(screen.getByTestId('coach-teaser')).toHaveTextContent(/weekly coach/i);
    await fireEvent.press(screen.getByText('Unlock Peakr Body'));
    expect(router.push).toHaveBeenCalledWith('/body/addon');
  });

  it('Today with the add-on: remaining energy and the energy of today’s session', async () => {
    storePlan();
    billing('active');
    fullProfile();
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByTestId('energy-today')).toBeOnTheScreen();
    expect(await screen.findByText(/kcal for today’s planned training/)).toBeOnTheScreen();
    expect(screen.queryByTestId('coach-teaser')).toBeNull();
  });

  it('Plan works the same with the add-on locked', async () => {
    storePlan();
    billing('never');
    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByText(/Week 2 of 17/)).toBeOnTheScreen();
  });
});

describe('export', () => {
  it('writes one CSV with every record type, quoting where needed', () => {
    const csv = bodyCsv({
      food: [
        {
          id: 'f',
          day: '2026-10-19',
          meal: 'lunch',
          name: 'Rice, "large"',
          kcal: 650,
          proteinG: 30,
          carbsG: null,
          fatG: null,
          foodId: null,
          amount: null,
          unit: null,
          portionLabel: null,
          createdAt: '',
        },
      ],
      weighIns: [
        {
          id: 'c',
          day: '2026-10-19',
          weightKg: 61.2,
          waistCm: null,
          bodyFatPct: null,
          note: null,
          createdAt: '',
        },
      ],
      checkIns: [
        {
          id: 'm',
          day: '2026-10-19',
          values: { waist: 72, hip: 95 },
          bodyFatPct: 24.1,
          bodyFatSource: 'navy',
          note: 'After holidays',
          photos: { front: { localUri: 'file://f.jpg', remotePath: null } },
          createdAt: '',
        },
      ],
      dayKcal: [{ day: '2026-10-18', intakeKcal: 2100, activeKcal: 350 }],
    });
    const [header, ...rows] = csv.split('\n');
    expect(header).toBe(
      'type,date,meal,name,amount,unit,kcal,protein_g,carbs_g,fat_g,active_kcal,weight_kg,' +
        'body_fat_pct,body_fat_source,neck_cm,waist_cm,belly_cm,hip_cm,chest_cm,shoulder_cm,' +
        'armL_cm,armR_cm,forearm_cm,thighL_cm,thighR_cm,calfL_cm,calfR_cm,photos,note',
    );
    expect(rows).toEqual([
      'food,2026-10-19,lunch,"Rice, ""large""",,,650,30,,,,,,,,,,,,,,,,,,,,,',
      'day,2026-10-18,,,,,2100,,,,350,,,,,,,,,,,,,,,,,,',
      'weigh-in,2026-10-19,,,,,,,,,,61.2,,,,,,,,,,,,,,,,,',
      'check-in,2026-10-19,,,,,,,,,,,24.1,navy,,72,,95,,,,,,,,,,front,After holidays',
      '',
    ]);
  });
});
