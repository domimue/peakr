import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useRemoteFlagsStore } from '@/config/remote-flags';
import * as ids from '@/data/ids';
import * as bodyRepo from '@/data/repositories/body-repository';
import { useBillingStore } from '@/features/billing/billing-store';
import { entitlementsOf, subscriptionsOf, type CustomerInfoLike } from '@/features/billing/model';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { BodyScreen } from '../screens/body-screen';
import { EnergySettingsScreen } from '../screens/energy-settings-screen';
import { GoalSetupScreen } from '../screens/goal-setup-screen';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/billing-repository');

const body = bodyRepo as unknown as typeof import('@/data/repositories/__mocks__/body-repository');
const TODAY = '2026-10-26';
const shift = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function active() {
  const e = {
    productIdentifier: 'peakr_body',
    store: 'PLAY_STORE',
    periodType: 'NORMAL',
    willRenew: true,
    expirationDate: '2026-12-01T00:00:00Z',
  };
  const info: CustomerInfoLike = {
    entitlements: { active: { body_nutrition: e }, all: { body_nutrition: e } },
    managementURL: null,
  };
  useRemoteFlagsStore.setState({ flags: { addon_body_nutrition: true }, loaded: true });
  useBillingStore.setState({
    status: 'ready',
    entitlements: entitlementsOf(info),
    subscriptions: subscriptionsOf(info),
    devBody: false,
    cachedAddon: null,
  });
}

/** Daily weigh-ins over `days`, ending today at `endKg`, losing `kgPerWeek`. */
function weighIns(days: number, kgPerWeek: number, endKg = 70) {
  body.store.checkIns = Array.from({ length: days + 1 }, (_, i) => ({
    id: `c${i}`,
    day: shift(TODAY, i - days),
    weightKg: Math.round((endKg + (kgPerWeek * (days - i)) / 7) * 10) / 10,
    waistCm: null,
    bodyFatPct: null,
    note: null,
    createdAt: 'x',
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  body.resetStore();
  active();
  body.store.profile = { sex: 'female', birthDate: '1991-03-14', heightCm: 168, weightKg: 70 };
  body.store.energySettings = { ...body.store.energySettings, everydayActivity: 'desk' };
  jest.spyOn(ids, 'todayIso').mockReturnValue(TODAY);
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('goal setup', () => {
  it('everyday activity → current → target → rate → summary; the floor is never silent', async () => {
    weighIns(1, 0);
    body.store.energySettings = { ...body.store.energySettings, everydayActivity: null };
    await renderWithQuery(<GoalSetupScreen />);
    // Asked once, before the first goal.
    expect(
      await screen.findByText('How active is your everyday life – without sport?'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Desk job'));
    await waitFor(() => expect(body.store.energySettings.everydayActivity).toBe('desk'));
    expect(
      await screen.findByText('From your weight trend – not a single weigh-in.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Next'));
    await fireEvent.changeText(screen.getByLabelText('Target weight'), '65');
    expect(screen.getByText('Lose weight')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Next'));

    // 1 % of 70 kg = 0.7 kg/week: "ambitious" and "aggressive" are off, with the reason.
    expect(screen.getByTestId('goal-preset-ambitious')).toBeDisabled();
    expect(screen.getByTestId('goal-preset-aggressive')).toBeDisabled();
    expect(
      screen.getAllByText(/above 1 % of your weight per week \(max 0.7 kg\/week\)/),
    ).toHaveLength(2);
    expect(screen.getByTestId('goal-preset-gentle')).toBeEnabled();

    await fireEvent.press(screen.getByTestId('goal-preset-gentle'));
    await fireEvent(screen.getByTestId('goal-rate-slider'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(screen.getByText('0.3 kg/week')).toBeOnTheScreen();
    // BMR 1414 × 1.3 (desk) = 1838 without sport: 0.3 kg/week keeps the floor.
    expect(screen.queryByTestId('goal-floor')).toBeNull();
    expect(screen.getByTestId('goal-preview')).toHaveTextContent(/Protein: 133 g/);
    // 0.5 kg/week would put rest days at 1288 – below the floor of 1414: said, and a pace proposed.
    await fireEvent.press(screen.getByTestId('goal-preset-recommended'));
    expect(screen.getByTestId('goal-floor')).toHaveTextContent(
      /0.5 kg per week would put your days without training below 1414 kcal.*0.35 kg per week/,
    );
    expect(screen.getByText('Next')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('goal-use-proposed'));
    expect(screen.queryByTestId('goal-floor')).toBeNull();
    expect(screen.getByText('0.35 kg/week')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Next'));

    expect(screen.queryByText('Weekly')).toBeNull();
    await fireEvent.press(screen.getByText('Save goal'));
    await waitFor(() => expect(body.store.goals).toHaveLength(1));
    expect(body.store.goals[0]).toMatchObject({
      kind: 'lose',
      targetWeightKg: 65,
      ratePerWeekKg: 0.35,
      reason: 'user',
    });
  });

  it('blocks a target below a BMI of 18.5', async () => {
    weighIns(1, 0);
    await renderWithQuery(<GoalSetupScreen />);
    await fireEvent.press(await screen.findByText('Next'));
    await fireEvent.changeText(screen.getByLabelText('Target weight'), '51');
    expect(screen.getByTestId('goal-issue')).toHaveTextContent(/healthy range/);
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('allows only "maintain" under 18', async () => {
    body.store.profile = { sex: 'female', birthDate: '2010-06-01', heightCm: 168, weightKg: 70 };
    weighIns(1, 0);
    await renderWithQuery(<GoalSetupScreen />);
    await fireEvent.press(await screen.findByText('Next'));
    await fireEvent.changeText(screen.getByLabelText('Target weight'), '66');
    expect(screen.getByTestId('goal-issue')).toHaveTextContent(/only available from age 18/);
    await fireEvent.press(screen.getByText('Keep my weight'));
    expect(screen.queryByTestId('goal-issue')).toBeNull();
    await fireEvent.press(screen.getByText('Next'));
    await fireEvent.press(screen.getByText('Save goal'));
    await waitFor(() =>
      expect(body.store.goals[0]).toMatchObject({ kind: 'maintain', reason: 'user' }),
    );
  });
});

describe('goal card', () => {
  const goal = {
    id: 'g1',
    createdAt: '2026-10-01T08:00:00Z',
    kind: 'lose' as const,
    startWeightKg: 72,
    targetWeightKg: 65,
    ratePerWeekKg: 0.25,
    eatBackPct: 50,
    weeklyMode: false,
    adjustmentKcal: 0,
    paused: false,
    reason: 'user' as const,
  };

  it('shows today’s target, both forecasts and pauses with a stored reason', async () => {
    weighIns(21, 0.5);
    body.store.goals = [goal];
    await renderWithQuery(<BodyScreen initial="progress" />);
    expect(await screen.findByTestId('goal-card')).toBeOnTheScreen();
    expect(screen.getByTestId('goal-forecast')).toHaveTextContent(
      /At your real pace \(0\.\d+ kg\/week\)/,
    );
    await fireEvent.press(screen.getByTestId('goal-pause'));
    await waitFor(() => expect(body.store.goals).toHaveLength(2));
    expect(body.store.goals[1]).toMatchObject({ paused: true, reason: 'user', targetWeightKg: 65 });
  });

  it('weekly check-in: faster than planned → suggests eating more, applied as an adaptive change', async () => {
    weighIns(14, 0.6);
    body.store.goals = [goal];
    await renderWithQuery(<BodyScreen initial="progress" />);
    expect(await screen.findByTestId('goal-check-in')).toHaveTextContent(/faster than planned/);
    await fireEvent.press(screen.getByText(/Adjust target \+\d+ kcal\/day/));
    await waitFor(() => expect(body.store.goals).toHaveLength(2));
    expect(body.store.goals[1]?.reason).toBe('adaptive');
    expect(body.store.goals[1]?.adjustmentKcal).toBeGreaterThan(0);
    expect(body.store.goals[1]?.adjustmentKcal).toBeLessThanOrEqual(150);
  });

  it('target reached → switch to maintain with a reverse diet', async () => {
    weighIns(3, 0, 64.8);
    body.store.goals = [goal];
    await renderWithQuery(<BodyScreen initial="progress" />);
    expect(await screen.findByTestId('goal-reached')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Switch to maintain'));
    await waitFor(() =>
      expect(body.store.goals[1]).toMatchObject({ kind: 'maintain', reason: 'user' }),
    );
  });

  it('without a goal Body offers to set one', async () => {
    weighIns(1, 0);
    await renderWithQuery(<BodyScreen />);
    await fireEvent.press(await screen.findByTestId('body-set-goal'));
    expect(router.push).toHaveBeenCalledWith('/body/goal');
  });
});

describe('energy targets', () => {
  it('a stored goal that is too fast for the floor is named on the Body tab, with the pace used', async () => {
    weighIns(21, 0);
    body.store.goals = [
      {
        id: 'g2',
        createdAt: '2026-10-01T08:00:00Z',
        kind: 'lose',
        startWeightKg: 70,
        targetWeightKg: 64,
        // Saved before the floor check: 0.7 kg/week is too fast for 1838 kcal without sport.
        ratePerWeekKg: 0.7,
        eatBackPct: 50,
        weeklyMode: false,
        adjustmentKcal: 0,
        paused: false,
        reason: 'user',
      },
    ];
    await renderWithQuery(<BodyScreen />);
    expect(await screen.findByTestId('target-below-floor')).toHaveTextContent(
      /pace of 0.7 kg per week is too fast.*uses 0.35 kg per week/,
    );
    expect(screen.getByTestId('target-breakdown')).toHaveTextContent(
      /Everyday activity\+ 424 kcal/,
    );
    await fireEvent.press(screen.getByText('Adjust the goal'));
    expect(router.push).toHaveBeenCalledWith('/body/goal');
  });

  it('everyday activity, protein and fat are saved; the macros follow', async () => {
    await renderWithQuery(<EnergySettingsScreen />);
    await fireEvent.press(await screen.findByText('On your feet all day'));
    await fireEvent(screen.getByTestId('energy-protein'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    await fireEvent.press(screen.getByTestId('energy-save'));
    await waitFor(() =>
      expect(body.store.energySettings).toEqual({
        everydayActivity: 'onFeet',
        proteinGPerKg: 1.8,
        fatGPerKg: 0.9,
      }),
    );
    expect(await screen.findByText('Saved.')).toBeOnTheScreen();
  });
});
