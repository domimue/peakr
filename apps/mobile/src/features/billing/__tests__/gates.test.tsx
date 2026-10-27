import { generatePlan } from '@peakr/engine';
import { screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';

import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as repo from '@/data/repositories/plan-repository';
import { BodyScreen } from '@/features/body/screens/body-screen';
import { PlanScreen } from '@/features/plan/screens/plan-screen';
import { WorkoutScreen } from '@/features/plan/screens/workout-screen';
import { lockActions } from '@/features/plan/queries';
import { TodayScreen } from '@/features/today/today-screen';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { useBillingStore } from '../billing-store';
import { withTraining } from '../locked';
import { NO_ENTITLEMENTS, type Entitlements } from '../model';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/activity-repository');
jest.mock('@/data/repositories/route-repository');
jest.mock('@/data/repositories/billing-repository');

const mock = repo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');

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
  const r = generatePlan(input.profile, input.goal, input.availability, '2026-10-19', '2027-02-14');
  if (!r.ok) throw new Error('plan');
  mock.store.plan = {
    id: 'plan-1',
    input,
    state: { plan: r.value, status: {}, pauses: [], revision: 0 },
  };
  return r.value;
}

/** Billing as the store reported it (release behaviour: no development grant). */
function billing(entitlements: Partial<Entitlements>) {
  useBillingStore.setState({
    status: 'ready',
    entitlements: { ...NO_ENTITLEMENTS, ...entitlements },
    devTraining: false,
  });
}
const preview = () => billing({});
const readOnly = () => billing({ hadTraining: true });
const full = () => billing({ tier: 'training' });

beforeEach(() => {
  mock.resetStore();
  jest.spyOn(ids, 'todayIso').mockReturnValue('2026-10-19');
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

function Feature() {
  return <Text>Feature</Text>;
}

describe('route gate', () => {
  it('shows the feature with the subscription and the paywall way without it', async () => {
    const Gated = withTraining(Feature);
    full();
    const { unmount } = await renderWithQuery(<Gated />);
    expect(screen.getByText('Feature')).toBeOnTheScreen();
    await unmount();

    preview();
    await renderWithQuery(<Gated />);
    expect(screen.queryByText('Feature')).toBeNull();
    expect(screen.getByText('Start 7-day free trial')).toBeOnTheScreen();
  });

  it('lets read-only screens through after the subscription ended, editing screens not', async () => {
    readOnly();
    const Reading = withTraining(Feature, { allowReadOnly: true });
    const { unmount } = await renderWithQuery(<Reading />);

    expect(screen.getByText('Feature')).toBeOnTheScreen();
    await unmount();
    const Editing = withTraining(Feature);
    await renderWithQuery(<Editing />);
    expect(screen.getByText('Your plan is read-only')).toBeOnTheScreen();
  });
});

describe('plan without a subscription', () => {
  it('refuses every edit when read-only', () => {
    const save = jest.fn(() => ({ ok: true as const, value: 1 }));
    const locked = lockActions({ ready: true, setStatus: save, move: save });
    expect(locked.ready).toBe(false);
    expect(locked.setStatus()).toEqual({
      ok: false,
      issues: [{ field: 'workout', code: 'locked' }],
    });
    expect(locked.move()).toEqual({ ok: false, issues: [{ field: 'workout', code: 'locked' }] });
    expect(save).not.toHaveBeenCalled();
  });

  it('Plan shows week 1 only, then the paywall', async () => {
    storePlan();
    preview();
    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByText('Week 1 of 17 · Base')).toBeOnTheScreen();
    expect(screen.queryByText(/Week 2 of 17/)).toBeNull();
    expect(screen.getByText('Week 1 is your free preview.')).toBeOnTheScreen();
    expect(screen.getByTestId('locked-card')).toBeOnTheScreen();
  });

  it('Today and the health data in Body show nothing but the way to the paywall', async () => {
    storePlan();
    preview();
    const { unmount } = await renderWithQuery(<TodayScreen />);
    expect(await screen.findByTestId('locked-card')).toBeOnTheScreen();
    expect(screen.queryByText('Mark as done')).toBeNull();
    await unmount();
    await renderWithQuery(<BodyScreen />);
    expect(screen.getByTestId('locked-card')).toBeOnTheScreen();
    expect(screen.queryByTestId('health-overview')).toBeNull();
  });

  it('a week-1 workout can be read without actions, a later one not at all', async () => {
    const plan = storePlan();
    preview();
    const first = plan.weeks[0]?.workouts[0]?.id ?? '';
    const later = plan.weeks[3]?.workouts[0]?.id ?? '';
    const { unmount } = await renderWithQuery(<WorkoutScreen id={first} />);
    expect(await screen.findByTestId('workout-header')).toBeOnTheScreen();
    expect(screen.queryByText('Move')).toBeNull();
    expect(screen.queryByText('Skip')).toBeNull();
    expect(screen.getByTestId('locked-card')).toBeOnTheScreen();
    await unmount();
    await renderWithQuery(<WorkoutScreen id={later} />);
    expect(await screen.findByTestId('locked-card')).toBeOnTheScreen();
    expect(screen.queryByTestId('workout-header')).toBeNull();
  });

  it('after the subscription ended Today shows the plan without actions', async () => {
    storePlan();
    readOnly();
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByText('Your plan is read-only')).toBeOnTheScreen();
    expect(screen.getByTestId('insights')).toBeOnTheScreen();
    expect(screen.queryByText('Mark as done')).toBeNull();
  });

  it('with the subscription the workout has its actions', async () => {
    const plan = storePlan();
    full();
    await renderWithQuery(<WorkoutScreen id={plan.weeks[3]?.workouts[0]?.id ?? ''} />);
    expect(await screen.findByTestId('workout-header')).toBeOnTheScreen();
    expect(screen.queryByTestId('locked-card')).toBeNull();
  });
});
