import { allWorkouts, generatePlan, type Commute, type Plan } from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as repo from '@/data/repositories/plan-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { usePlanUiStore } from '../plan-ui-store';
import { CommutesScreen } from '../screens/commutes-screen';
import { TodayScreen } from '../../today/today-screen';
import { CalendarScreen } from '../screens/calendar-screen';
import { PlanScreen } from '../screens/plan-screen';
import { TravelScreen } from '../screens/travel-screen';
import { WeekScreen } from '../screens/week-screen';
import { WinterScreen } from '../screens/winter-screen';

jest.mock('@/data/repositories/plan-repository');

const mock = repo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');

/** Half marathon from Monday 2026-10-19 (same plan as the other plan screen tests). */
const base: StoredPlanInput = {
  profile: {
    age: 35,
    experience: 'intermediate',
    sports: ['run'],
    terrain: 'flat',
    strength: { mode: 'peakr', equipment: 'gym' },
  },
  goal: { kind: 'half' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  targetDate: '2027-02-14',
  hrZones: { age: 35, restingHr: 55 },
};

const commute: Commute = { id: 'c1', sport: 'bike', oneWayMin: 20, weekdays: [0], bothWays: true };

function storePlan(input: StoredPlanInput = base): Plan {
  const r = generatePlan(input.profile, input.goal, input.availability, '2026-10-19', '2027-02-14');
  if (!r.ok) throw new Error('plan');
  mock.store.plan = {
    id: 'plan-1',
    input,
    state: { plan: r.value, status: {}, pauses: [], revision: 0 },
  };
  return r.value;
}

const stored = () => {
  if (!mock.store.plan) throw new Error('no plan stored');
  return mock.store.plan;
};

beforeEach(() => {
  mock.resetStore();
  usePlanUiStore.setState({ weekStart: null, feedback: null });
  jest.spyOn(ids, 'todayIso').mockReturnValue('2026-10-19');
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('commutes', () => {
  it('skip commute today with one tap, and undo', async () => {
    storePlan({ ...base, profile: { ...base.profile, commutes: [commute] } });
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByTestId('commute-today')).toBeOnTheScreen();
    expect(screen.getByText('Ride · 40 min')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Skip commute today'));
    const id = allWorkouts(stored().state.plan).find((w) => w.role === 'commute')?.id ?? '';
    await waitFor(() => expect(stored().state.status[id]).toBe('skipped'));
    expect(
      await screen.findByText('Skipped today – it does not count towards your load.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Undo'));
    await waitFor(() => expect(stored().state.status[id]).toBeUndefined());
  });

  it('adds a commute in the settings and rebuilds the plan', async () => {
    storePlan();
    await renderWithQuery(<CommutesScreen />);
    expect(await screen.findByText('No commutes yet.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Add commute'));
    expect(screen.getByText('On which days?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Save and rebuild plan'));
    await waitFor(() => expect(stored().input.profile.commutes).toHaveLength(1));
    expect(stored().input.profile.commutes?.[0]).toMatchObject({
      sport: 'bike',
      oneWayMin: 20,
      weekdays: [0, 1, 2, 3, 4],
      bothWays: true,
    });
    expect(
      await screen.findByText('By bike · 20 min · there and back · Mon, Tue, Wed, Thu, Fri'),
    ).toBeOnTheScreen();
    expect(stored().state.revision).toBe(1);
  });

  it('edits and removes a commute', async () => {
    storePlan({ ...base, profile: { ...base.profile, commutes: [commute] } });
    await renderWithQuery(<CommutesScreen />);
    await fireEvent.press(await screen.findByText('Edit commute'));
    await fireEvent.press(screen.getByText('Walking'));
    await fireEvent.press(screen.getByText('Save and rebuild plan'));
    await waitFor(() => expect(stored().input.profile.commutes?.[0]?.sport).toBe('walk'));
    expect(stored().input.profile.commutes?.[0]?.id).toBe('c1');
    await fireEvent.press(await screen.findByText('Edit commute'));
    await fireEvent.press(screen.getByText('Remove commute'));
    await waitFor(() => expect(stored().input.profile.commutes).toEqual([]));
  });
});

describe('this week is different', () => {
  it('days away: only that week is rebuilt and shown as different', async () => {
    const before = storePlan();
    await renderWithQuery(<WeekScreen start="2026-10-26" />);
    await fireEvent.press(await screen.findByText('Monday, Oct 26'));
    await fireEvent.press(screen.getByText('Tuesday, Oct 27'));
    await fireEvent.press(screen.getByText('Rebuild this week'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(stored().input.availability.weekOverrides).toEqual([
      {
        weekStart: '2026-10-26',
        minutesPerDay: [60, 60, 45, 60, 0, 120, 90],
        blockedDates: ['2026-10-26', '2026-10-27'],
      },
    ]);
    const workouts = allWorkouts(stored().state.plan);
    expect(workouts.some((w) => w.date === '2026-10-26' || w.date === '2026-10-27')).toBe(false);
    const later = (p: Plan) => allWorkouts(p).filter((w) => w.date >= '2026-11-02');
    expect(later(stored().state.plan)).toEqual(later(before));

    usePlanUiStore.setState({ weekStart: '2026-10-26' });
    await renderWithQuery(<CalendarScreen />);
    expect(await screen.findByText('Different week')).toBeOnTheScreen();
  });

  it('reset week goes back to the normal week', async () => {
    storePlan();
    mock.store.plan = {
      ...stored(),
      input: {
        ...base,
        availability: {
          ...base.availability,
          weekOverrides: [{ weekStart: '2026-10-26', blockedDates: ['2026-10-26'] }],
        },
      },
    };
    await renderWithQuery(<WeekScreen start="2026-10-26" />);
    await fireEvent.press(await screen.findByText('Reset week'));
    await waitFor(() => expect(stored().input.availability.weekOverrides).toEqual([]));
  });
});

describe('travel mode', () => {
  it('starts travel mode for the chosen days and ends it again', async () => {
    storePlan();
    await renderWithQuery(<TravelScreen />);
    await fireEvent.press(await screen.findByText('A pool is available'));
    await fireEvent.press(screen.getByText('Start travel mode'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(stored().input.availability.travel).toEqual([
      { startDate: '2026-10-19', endDate: '2026-10-25', poolAvailable: true },
    ]);
    const trip = allWorkouts(stored().state.plan).filter((w) => w.date <= '2026-10-25');
    expect(trip.every((w) => w.travel === true)).toBe(true);

    await renderWithQuery(<TravelScreen />);
    expect(
      await screen.findByText('Travel mode from Mon, Oct 19 to Sun, Oct 25.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('End travel mode'));
    await waitFor(() => expect(stored().input.availability.travel).toEqual([]));
  });

  it('a travel week is tagged in the Plan tab', async () => {
    storePlan();
    mock.store.plan = {
      ...stored(),
      input: {
        ...base,
        availability: {
          ...base.availability,
          travel: [{ startDate: '2026-10-19', endDate: '2026-10-21' }],
        },
      },
    };
    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByText('Travel')).toBeOnTheScreen();
  });
});

describe('winter sports', () => {
  it('saves winter sports and the default winter period', async () => {
    storePlan();
    await renderWithQuery(<WinterScreen />);
    await fireEvent.press(await screen.findByText('Cross-country skiing'));
    await fireEvent.press(screen.getByText('Save and rebuild plan'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(stored().input.profile).toMatchObject({
      winterSports: ['xcski'],
      winterMonths: [12, 1, 2, 3],
    });
    const december = allWorkouts(stored().state.plan).filter(
      (w) => w.date.startsWith('2026-12') && w.role === 'long',
    );
    expect(december.some((w) => w.winterVariant?.sport === 'xcski')).toBe(true);
  });
});
