import { generatePlan, newPlanState } from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { StoredPlanInput } from '@/data/db/schema';
import * as baselineRepo from '@/data/repositories/baseline-repository';
import type { StoredBaselineActivity } from '@/data/repositories/baseline-repository';
import * as planRepo from '@/data/repositories/plan-repository';
import { useSessionStore } from '@/features/auth/session-store';
import { connect } from '@/features/integrations/api';
import { renderWithQuery } from '@/test-utils/render-with-query';
import { Button, Text } from '@/ui';

import IntegrationResult from '../../../../app/integrations/[provider]';
import { importBaseline } from '../api';
import { useBaselineStore } from '../baseline-store';
import { usePendingConnect } from '../pending-connect';
import { BaselineSelectScreen } from '../screens/baseline-select-screen';
import { useBaselineImport } from '../screens/baseline-step';
import { BaselineSummaryScreen } from '../screens/baseline-summary-screen';

jest.mock('@/data/repositories/baseline-repository');
jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/onboarding-repository');
jest.mock('@/features/integrations/api', () => ({ connect: jest.fn() }));
jest.mock('../api', () => ({ importBaseline: jest.fn() }));
jest.mock('@/features/integrations/screens/connections-screen', () => {
  const { Text } = jest.requireActual('react-native');
  return { ConnectionsScreen: () => <Text>Connections screen</Text> };
});
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: jest.fn(() => ({ provider: 'strava', status: 'connected' })),
}));

const baseline =
  baselineRepo as unknown as typeof import('@/data/repositories/__mocks__/baseline-repository');
const plans = planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');

function activity(i: number, over: Partial<StoredBaselineActivity> = {}): StoredBaselineActivity {
  const d = new Date(Date.UTC(2026, 8, 1 + i * 2));
  return {
    externalId: String(i),
    sport: 'run',
    name: `Run ${i}`,
    date: d.toISOString().slice(0, 10),
    durationSec: 3000,
    distanceM: 8000,
    elevationGainM: 40,
    avgHr: 140,
    maxHr: 170,
    indoor: false,
    manual: false,
    race: false,
    best20MinHr: null,
    selected: true,
    outlier: null,
    ...over,
  };
}

function seed(activities: StoredBaselineActivity[]) {
  baseline.store.activities = activities;
  baseline.store.meta = {
    importedAt: 0,
    stravaHrZones: null,
    zonesScopeMissing: true,
    overrides: {},
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  baseline.resetStore();
  plans.resetStore();
  useBaselineStore.setState({ activities: [], meta: null, hydrated: false });
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'replace').mockImplementation(() => undefined);
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
  useSessionStore.setState({ ensureSession: jest.fn(async () => 'anon-user') });
  usePendingConnect.setState({ flow: null });
});

afterEach(() => jest.restoreAllMocks());

/** The connect flow as Profile → Training zones runs it (the quiz no longer has a Strava step). */
function ImportHarness() {
  const { t } = useTranslation();
  const { start, error } = useBaselineImport('recalibrate');
  return (
    <>
      <Button label="Connect with Strava" onPress={() => void start()} />
      {error ? <Text>{t(error as never)}</Text> : null}
    </>
  );
}

describe('baseline import', () => {
  it('signs in anonymously, connects Strava and opens the list', async () => {
    jest
      .mocked(importBaseline)
      .mockResolvedValueOnce({ ok: false, reason: 'not_connected' })
      .mockImplementationOnce(async () => {
        seed([activity(1)]);
        return { ok: true, activities: 1 };
      });
    jest.mocked(connect).mockResolvedValueOnce('connected');
    await renderWithQuery(<ImportHarness />);
    fireEvent.press(await screen.findByRole('button', { name: 'Connect with Strava' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/training/baseline'));
    expect(useSessionStore.getState().ensureSession).toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith('strava', undefined);
  });

  it('a declined connection shows a message', async () => {
    jest.mocked(importBaseline).mockResolvedValueOnce({ ok: false, reason: 'not_connected' });
    jest.mocked(connect).mockResolvedValueOnce('denied');
    await renderWithQuery(<ImportHarness />);
    fireEvent.press(await screen.findByRole('button', { name: 'Connect with Strava' }));
    expect(await screen.findByText(/Strava access was not granted/)).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('Strava consent handled by the Strava app (Android deep link)', () => {
  const linkStatus = (status: string) =>
    jest.mocked(useLocalSearchParams).mockReturnValue({ provider: 'strava', status });

  it('the connect flow waits for the deep link instead of giving up', async () => {
    jest.mocked(importBaseline).mockResolvedValueOnce({ ok: false, reason: 'not_connected' });
    jest.mocked(connect).mockResolvedValueOnce('cancelled');
    await renderWithQuery(<ImportHarness />);
    fireEvent.press(await screen.findByRole('button', { name: 'Connect with Strava' }));
    await waitFor(() => expect(usePendingConnect.getState().flow).toBe('recalibrate'));
    expect(screen.queryByText(/went wrong/)).toBeNull();
  });

  it('a successful deep link goes on with the import and the list', async () => {
    usePendingConnect.setState({ flow: 'onboarding' });
    linkStatus('connected');
    jest.mocked(importBaseline).mockResolvedValueOnce({ ok: true, activities: 3 });
    await renderWithQuery(<IntegrationResult />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/baseline'));
    expect(usePendingConnect.getState().flow).toBeNull();
    expect(screen.queryByText('Connections screen')).toBeNull();
  });

  it('a declined consent explains it and leads back to the quiz', async () => {
    usePendingConnect.setState({ flow: 'onboarding' });
    linkStatus('denied');
    await renderWithQuery(<IntegrationResult />);
    expect(await screen.findByText(/Strava access was not granted/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalled();
    expect(importBaseline).not.toHaveBeenCalled();
  });

  it('recalibration returns to its own list', async () => {
    usePendingConnect.setState({ flow: 'recalibrate' });
    linkStatus('connected');
    jest.mocked(importBaseline).mockResolvedValueOnce({ ok: true, activities: 3 });
    await renderWithQuery(<IntegrationResult />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/training/baseline'));
  });

  it('without a waiting baseline flow the link shows Connections as before', async () => {
    linkStatus('connected');
    await renderWithQuery(<IntegrationResult />);
    expect(await screen.findByText('Connections screen')).toBeOnTheScreen();
  });
});

describe('baseline list', () => {
  it('shows the facts, the reason for an untick and lets the user choose', async () => {
    seed([
      activity(1),
      activity(2, { race: true, selected: false, outlier: 'race', name: 'City 10k' }),
    ]);
    await renderWithQuery(<BaselineSelectScreen flow="onboarding" />);
    expect(await screen.findByText('Unticked: marked as a race on Strava.')).toBeOnTheScreen();
    expect(screen.getAllByText(/8\.0 km · 50:00 · Ø 140 bpm · 6:15 \/km/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Continue with 1 activity' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('checkbox', { name: /^City 10k/ }));
    expect(baseline.setBaselineSelected).toHaveBeenCalledWith(['2'], true);
    fireEvent.press(await screen.findByRole('button', { name: 'Continue with 2 activities' }));
    expect(router.replace).toHaveBeenCalledWith('/onboarding/baseline-summary');
  });

  it('"Select all" unticks and ticks everything', async () => {
    seed([activity(1), activity(2)]);
    await renderWithQuery(<BaselineSelectScreen flow="onboarding" />);
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Select all (2)' }));
    expect(baseline.setBaselineSelected).toHaveBeenCalledWith(['2', '1'], false);
  });
});

describe('baseline summary', () => {
  const input: StoredPlanInput = {
    profile: {
      age: 35,
      experience: 'beginner',
      sports: ['run', 'swim'],
      terrain: 'flat',
      strength: { mode: 'none' },
    },
    goal: { kind: 'fitness' },
    availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: true },
    hrZones: { age: 35 },
  };

  function storePlan() {
    const r = generatePlan(input.profile, input.goal, input.availability, '2026-10-19');
    if (!r.ok) throw new Error('plan');
    plans.store.plan = { id: 'plan-1', input, state: newPlanState(r.value) };
  }

  it('shows the derived values with their basis, "not enough data" and the user’s entry', async () => {
    storePlan();
    seed(Array.from({ length: 24 }, (_, i) => activity(i)));
    await renderWithQuery(<BaselineSummaryScreen flow="recalibrate" />);
    expect(await screen.findByText(/^6:\d\d \/km – from \d+ activities$/)).toBeOnTheScreen();
    // No swims in the list.
    expect(
      screen.getAllByText(/Not enough data \(0 of 3 activities needed\)/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Reconnect Strava to use the heart-rate zones/)).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Edit: Easy pace (grade-adjusted)' }));
    fireEvent.changeText(await screen.findByPlaceholderText('6:10'), '6:30');
    await screen.findByDisplayValue('6:30');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(baseline.saveBaselineOverrides).toHaveBeenCalledWith({ easyPaceSecPerKm: 390 });
    expect(await screen.findByText('6:30 /km – your entry')).toBeOnTheScreen();
  });

  it('shows the long session with its distance and what the plan starts from', async () => {
    storePlan();
    // 50-minute runs every other day, every fourth one a 13.5 km long run of 80 minutes.
    seed(
      Array.from({ length: 24 }, (_, i) =>
        i % 4 === 3 ? activity(i, { durationSec: 80 * 60, distanceM: 13_500 }) : activity(i),
      ),
    );
    await renderWithQuery(<BaselineSummaryScreen flow="recalibrate" />);
    expect(await screen.findByText(/^80 min · 13\.5 km – from \d+ activities$/)).toBeOnTheScreen();
    const start = screen.getByTestId('baseline-plan-start');
    expect(start).toHaveTextContent(/First long session at least 70 min \(≈ 11\.8 km\)/);
    expect(start).toHaveTextContent(/Week 1 at least \d+ min/);
  });

  it('recalibration regenerates the remaining plan with the baseline', async () => {
    storePlan();
    seed(Array.from({ length: 24 }, (_, i) => activity(i)));
    await renderWithQuery(<BaselineSummaryScreen flow="recalibrate" />);
    fireEvent.press(await screen.findByRole('button', { name: 'Apply to my plan' }));
    await waitFor(() => expect(plans.savePlanState).toHaveBeenCalled());
    const saved = jest.mocked(plans.savePlanState).mock.calls[0]?.[2] as StoredPlanInput;
    expect(saved.profile.baseline?.thresholdPaceSecPerKm).toBeGreaterThan(0);
    expect(router.back).toHaveBeenCalled();
  });
});
