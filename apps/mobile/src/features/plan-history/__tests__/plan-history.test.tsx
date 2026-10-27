import { allWorkouts, generatePlan, type Plan } from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import * as Sharing from 'expo-sharing';

import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as repo from '@/data/repositories/plan-repository';
import { usePlanUiStore } from '@/features/plan/plan-ui-store';
import { PlanScreen } from '@/features/plan/screens/plan-screen';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { planHistoryJson } from '../export';
import { ArchivedPlanScreen, PlanHistoryScreen } from '../plan-history-screen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/activity-repository');
jest.mock('@/data/repositories/route-repository');

const mock = repo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');

const input: StoredPlanInput = {
  profile: {
    age: 35,
    experience: 'intermediate',
    sports: ['run'],
    terrain: 'flat',
    strength: { mode: 'none' },
  },
  goal: { kind: '10k' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  targetDate: '2026-12-20',
};

function plan(start: string, target: string, kind: '10k' | 'half' = '10k'): Plan {
  const r = generatePlan(input.profile, { kind }, input.availability, start, target);
  if (!r.ok) throw new Error('plan');
  return r.value;
}

/** A first plan with the sessions up to `until` done (share of them), stored as the active plan. */
function storeFirstPlan(until: string, share = 1) {
  const p = plan('2026-10-19', '2026-12-20');
  const sessions = allWorkouts(p).filter((w) => w.date <= until);
  const done = sessions.slice(0, Math.round(sessions.length * share));
  mock.store.plan = {
    id: 'plan-old',
    input,
    state: {
      plan: p,
      status: Object.fromEntries(done.map((w) => [w.id, 'done' as const])),
      pauses: [],
      revision: 0,
    },
  };
  return done;
}

const setToday = (iso: string) => jest.spyOn(ids, 'todayIso').mockReturnValue(iso);

beforeEach(() => {
  mock.resetStore();
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'replace').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('Insights over several plans', () => {
  it('"This plan" / "All time": archived sessions are labelled and only in "All time"', async () => {
    setToday('2026-11-10');
    storeFirstPlan('2026-11-09');
    await mock.createPlan(
      { ...input, goal: { kind: 'half' } },
      plan('2026-11-10', '2027-03-14', 'half'),
      '2026-11-10',
    );
    expect(mock.store.archive[0]?.outcome).toBe('replaced');

    usePlanUiStore.setState({ view: 'history' });
    await renderWithQuery(<PlanScreen />);
    // This plan: nothing done yet.
    expect(await screen.findByText('No completed sessions yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('All time'));
    expect(screen.getByText('October 2026')).toBeOnTheScreen();
    expect(screen.getAllByText(/· Plan: 10 km race$/).length).toBeGreaterThan(0);
    // Archived sessions are read-only: no workout screen of the current plan behind them.
    await fireEvent.press(screen.getAllByText(/· Plan: 10 km race$/)[0] as never);
    expect(router.push).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Records'));
    expect(screen.getByText('Personal bests · all plans')).toBeOnTheScreen();
    expect(screen.getByText('Lifetime · all plans')).toBeOnTheScreen();
    // A replaced plan never earns a badge.
    expect(screen.queryByTestId('badges')).toBeNull();
  });

  it('without an active plan the archive still shows ("All time" only)', async () => {
    setToday('2026-12-21');
    storeFirstPlan('2026-12-19');
    await mock.archiveEndedPlan('2026-12-21');
    expect(mock.store.plan).toBeNull();
    usePlanUiStore.setState({ view: 'history' });
    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByText('October 2026')).toBeOnTheScreen();
    expect(screen.queryByText('This plan')).toBeNull();
  });
});

describe('Plan history and badges', () => {
  it('a plan run through with ≥ 80 % done is completed and earns badges', async () => {
    setToday('2026-12-21');
    storeFirstPlan('2026-12-19', 0.9);
    await mock.archiveEndedPlan('2026-12-21');
    expect(mock.store.archive[0]?.outcome).toBe('completed');

    await renderWithQuery(<PlanHistoryScreen />);
    expect(await screen.findByText('10 km race · Completed')).toBeOnTheScreen();
    expect(screen.getByLabelText('10 km race · Dec 2026')).toBeOnTheScreen();
    expect(screen.getByLabelText('First plan completed')).toBeOnTheScreen();
    expect(screen.getByText(/\d+ of \d+ sessions · 9\d %/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('10 km race · Completed'));
    expect(router.push).toHaveBeenCalledWith('/training/plan-history/plan-old');
  });

  it('below 80 % the plan is finished – no badge', async () => {
    setToday('2026-12-21');
    storeFirstPlan('2026-12-19', 0.5);
    await mock.archiveEndedPlan('2026-12-21');
    await renderWithQuery(<PlanHistoryScreen />);
    expect(await screen.findByText('10 km race · Finished')).toBeOnTheScreen();
    expect(screen.queryByTestId('badges')).toBeNull();
  });

  it('the archived plan opens read-only with its sessions per group', async () => {
    setToday('2026-12-21');
    const done = storeFirstPlan('2026-12-19', 0.9);
    await mock.archiveEndedPlan('2026-12-21');
    await mock.saveArchiveReview('plan-old', { lines: [{ key: 'levelsDownHard' }] });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'plan-old' });
    await renderWithQuery(<ArchivedPlanScreen />);
    expect(await screen.findByTestId('archived-summary')).toBeOnTheScreen();
    expect(screen.getByText('Long sessions')).toBeOnTheScreen();
    expect(screen.getByTestId(`archived-${done[0]?.id}`)).toBeOnTheScreen();
    expect(screen.getByText('Archived plans are read-only.')).toBeOnTheScreen();
    expect(
      screen.getByText('•  It felt too hard – sessions start one level lower.'),
    ).toBeOnTheScreen();
  });

  it('same-day undo brings the previous plan back', async () => {
    setToday('2026-11-10');
    storeFirstPlan('2026-11-09');
    const old = mock.store.plan?.state;
    await mock.createPlan(input, plan('2026-11-10', '2027-01-31'), '2026-11-10');
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    await renderWithQuery(<PlanHistoryScreen />);
    await fireEvent.press(await screen.findByTestId('undo-plan-button'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/plan'));
    expect(mock.store.plan?.state).toEqual(old);
    expect(mock.store.archive).toEqual([]);
  });

  it('exports the history as JSON with done sessions only', async () => {
    setToday('2026-11-10');
    const done = storeFirstPlan('2026-11-09');
    await mock.createPlan(input, plan('2026-11-10', '2027-01-31'), '2026-11-10');
    const json = JSON.parse(planHistoryJson(mock.store.archive, '2026-11-10T08:00:00Z'));
    expect(json.plans[0]).toMatchObject({ outcome: 'replaced', goal: { kind: '10k' } });
    expect(json.plans[0].sessions).toHaveLength(done.length);
    jest.spyOn(Sharing, 'isAvailableAsync').mockResolvedValue(false);
    await renderWithQuery(<PlanHistoryScreen />);
    await fireEvent.press(await screen.findByTestId('export-plan-history'));
    expect(Sharing.isAvailableAsync).toHaveBeenCalled();
  });
});
