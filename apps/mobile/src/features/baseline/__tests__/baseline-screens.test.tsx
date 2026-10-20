import { generatePlan, newPlanState } from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { StoredPlanInput } from '@/data/db/schema';
import * as baselineRepo from '@/data/repositories/baseline-repository';
import type { StoredBaselineActivity } from '@/data/repositories/baseline-repository';
import * as planRepo from '@/data/repositories/plan-repository';
import { useSessionStore } from '@/features/auth/session-store';
import { connect } from '@/features/integrations/api';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { importBaseline } from '../api';
import { useBaselineStore } from '../baseline-store';
import { BaselineSelectScreen } from '../screens/baseline-select-screen';
import { BaselineStep } from '../screens/baseline-step';
import { BaselineSummaryScreen } from '../screens/baseline-summary-screen';

jest.mock('@/data/repositories/baseline-repository');
jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/onboarding-repository');
jest.mock('@/features/integrations/api', () => ({ connect: jest.fn() }));
jest.mock('../api', () => ({ importBaseline: jest.fn() }));

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
});

afterEach(() => jest.restoreAllMocks());

describe('baseline quiz step', () => {
  it('says what is read and that it is reference only', async () => {
    await renderWithQuery(<BaselineStep />);
    expect(await screen.findByText('Make my plan more accurate')).toBeOnTheScreen();
    expect(
      screen.getByText(/only runs, rides and swims from the last 60 days, nothing older/),
    ).toBeOnTheScreen();
  });

  it('signs in anonymously, connects Strava for the baseline and opens the list', async () => {
    jest
      .mocked(importBaseline)
      .mockResolvedValueOnce({ ok: false, reason: 'not_connected' })
      .mockImplementationOnce(async () => {
        seed([activity(1)]);
        return { ok: true, activities: 1 };
      });
    jest.mocked(connect).mockResolvedValueOnce('connected');
    await renderWithQuery(<BaselineStep />);
    fireEvent.press(await screen.findByRole('button', { name: 'Connect Strava' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/baseline'));
    expect(useSessionStore.getState().ensureSession).toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith('strava', 'baseline');
  });

  it('a declined connection shows a message and leaves skipping open', async () => {
    jest.mocked(importBaseline).mockResolvedValueOnce({ ok: false, reason: 'not_connected' });
    jest.mocked(connect).mockResolvedValueOnce('denied');
    await renderWithQuery(<BaselineStep />);
    fireEvent.press(await screen.findByRole('button', { name: 'Connect Strava' }));
    expect(await screen.findByText(/Strava access was not granted/)).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
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
