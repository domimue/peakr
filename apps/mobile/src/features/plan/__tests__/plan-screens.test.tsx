import { allWorkouts, findWorkout, generatePlan, type Plan } from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as repo from '@/data/repositories/plan-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { usePlanUiStore } from '../plan-ui-store';
import { AvailabilityScreen } from '../screens/availability-screen';
import { PauseScreen } from '../screens/pause-screen';
import { PlanScreen } from '../screens/plan-screen';
import { WorkoutScreen } from '../screens/workout-screen';

jest.mock('@/data/repositories/plan-repository');

const mock = repo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');

/**
 * Same plan as the engine edit tests: half marathon, intermediate, from Monday 2026-10-19.
 * Week 2: Mon easy · Tue strength (heavy legs) · Wed easy · Thu strength · Sat long · Sun fartlek.
 */
const input: StoredPlanInput = {
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

function storePlan(): Plan {
  const r = generatePlan(input.profile, input.goal, input.availability, '2026-10-19', '2027-02-14');
  if (!r.ok) throw new Error('plan');
  mock.store.plan = {
    id: 'plan-1',
    input,
    state: { plan: r.value, status: {}, pauses: [], revision: 0 },
  };
  return r.value;
}

function setToday(iso: string) {
  jest.spyOn(ids, 'todayIso').mockReturnValue(iso);
}

const state = () => {
  if (!mock.store.plan) throw new Error('no plan stored');
  return mock.store.plan.state;
};

beforeEach(() => {
  mock.resetStore();
  usePlanUiStore.setState({ view: 'week', weekStart: null, month: null, feedback: null });
  setToday('2026-10-19');
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('Plan tab', () => {
  it('shows the current week with its workouts, today highlighted, and pages weeks', async () => {
    storePlan();
    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByText('Oct 19 – Oct 25')).toBeOnTheScreen();
    expect(screen.getByText('Week 1 of 17 · Base')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Monday, October 19, Today$/)).toBeOnTheScreen();
    expect(screen.getByTestId('plan-card-0-0')).toBeOnTheScreen();
    // The week at a glance: sessions and km instead of minutes.
    expect(screen.getByTestId('week-summary')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^6 sessions$/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^\d+ km Run$/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Next week'));
    expect(screen.getByText('Oct 26 – Nov 1')).toBeOnTheScreen();
    // General names in the calendar; sport, km and zone are written out, not only colour-coded.
    expect(screen.getByLabelText(/^Easy run, Run, 50 min · [\d.]+ km, Zone 2$/)).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/^Strength, Strength, 50 min, Hard$/)).toHaveLength(2);
    expect(screen.getByLabelText(/^Intervals, Run, /)).toBeOnTheScreen();
    expect(screen.queryByText('Peakr strength – base')).toBeNull();
    expect(screen.getAllByText('Rest day').length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByLabelText(/^Easy run, Run, 50 min/));
    expect(router.push).toHaveBeenCalledWith('/training/workout/2026-10-26-1');
  });

  it('month view: tap a week to open it in the week view', async () => {
    storePlan();
    await renderWithQuery(<PlanScreen />);
    await fireEvent.press(await screen.findByText('Month'));
    expect(screen.getByText('October 2026')).toBeOnTheScreen();
    expect(screen.getByTestId('month-day-2026-10-19')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Open the week of October 26'));
    expect(usePlanUiStore.getState()).toMatchObject({ view: 'week', weekStart: '2026-10-26' });
  });
});

describe('moving a workout', () => {
  it('the move stays exactly as made; the swap is only suggested and can be applied', async () => {
    storePlan();
    await renderWithQuery(<WorkoutScreen id="2026-10-28-1" startMoving />);
    await fireEvent.press(await screen.findByText('Tue, Oct 27'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(findWorkout(state().plan, '2026-10-28-1')?.date).toBe('2026-10-27');
    expect(findWorkout(state().plan, '2026-10-27-1')?.date).toBe('2026-10-27');

    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByText('Moved to Tuesday, Oct 27.')).toBeOnTheScreen();
    expect(
      screen.getByText('Suggestion to keep your week balanced: Strength to Wednesday, Oct 28.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Apply suggestion'));
    await waitFor(() => expect(findWorkout(state().plan, '2026-10-27-1')?.date).toBe('2026-10-28'));
    expect(usePlanUiStore.getState().feedback).toBeNull();
  });

  it('warns about two hard days in a row; "make the other day easier" eases it', async () => {
    storePlan();
    await renderWithQuery(<WorkoutScreen id="2026-10-27-1" startMoving />);
    await fireEvent.press(await screen.findByText('Mon, Oct 26'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());

    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByText(/^Two hard days in a row/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Make the other day easier'));
    await waitFor(() =>
      expect(findWorkout(state().plan, '2026-10-25-1')).toMatchObject({
        type: 'easy',
        hard: false,
      }),
    );
    expect(usePlanUiStore.getState().feedback).toBeNull();
  });

  it('warnings can be closed – the plan stays as the user made it', async () => {
    storePlan();
    await renderWithQuery(<WorkoutScreen id="2026-10-27-1" startMoving />);
    await fireEvent.press(await screen.findByText('Mon, Oct 26'));
    await renderWithQuery(<PlanScreen />);
    await fireEvent.press(await screen.findByLabelText('Close'));
    expect(usePlanUiStore.getState().feedback).toBeNull();
    expect(findWorkout(state().plan, '2026-10-25-1')?.hard).toBe(true);
    expect(findWorkout(state().plan, '2026-10-27-1')?.date).toBe('2026-10-26');
  });

  it('past and completed workouts can be moved too', async () => {
    storePlan();
    setToday('2026-10-28');
    mock.store.plan = {
      ...(mock.store.plan as NonNullable<typeof mock.store.plan>),
      state: { ...state(), status: { '2026-10-26-1': 'done' } },
    };
    await renderWithQuery(<WorkoutScreen id="2026-10-26-1" startMoving />);
    await fireEvent.press(await screen.findByText('Sun, Oct 25'));
    await waitFor(() => expect(findWorkout(state().plan, '2026-10-26-1')?.date).toBe('2026-10-25'));
    expect(state().status['2026-10-26-1']).toBe('done');
    expect(usePlanUiStore.getState().feedback?.warnings.map((w) => w.code)).toContain('pastDay');
  });
});

describe('workout detail', () => {
  it('shows steps, zone target with bpm and "why this session"; marks done and back', async () => {
    storePlan();
    setToday('2026-10-26');
    await renderWithQuery(<WorkoutScreen id="2026-10-26-1" />);
    expect(await screen.findByText('Structure')).toBeOnTheScreen();
    // General name as title, the concrete session below, plus duration and km.
    expect(screen.getByText('Easy run')).toBeOnTheScreen();
    expect(screen.getByText(/^\d+(\.\d)? km$/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Easy run explained'));
    expect(router.push).toHaveBeenCalledWith('/training/workout-types?focus=run.easy');
    expect(screen.getByText('Why this session')).toBeOnTheScreen();
    expect(screen.getByText(/^Zone 2 · \d+–\d+ bpm$/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Mark as done'));
    await waitFor(() => expect(state().status['2026-10-26-1']).toBe('done'));
    await fireEvent.press(await screen.findByText('Back to planned'));
    await waitFor(() => expect(state().status).toEqual({}));
  });

  it('skips a future workout; the concrete session is the subtitle', async () => {
    storePlan();
    await renderWithQuery(<WorkoutScreen id="2026-10-27-1" />);
    expect(await screen.findByText('Skip this workout')).toBeOnTheScreen();
    expect(screen.getByText('Strength')).toBeOnTheScreen();
    expect(screen.getByText('Peakr strength – base')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Skip this workout'));
    await waitFor(() => expect(state().status['2026-10-27-1']).toBe('skipped'));
  });

  it('a future workout can also be marked done', async () => {
    storePlan();
    await renderWithQuery(<WorkoutScreen id="2026-10-28-1" />);
    await fireEvent.press(await screen.findByText('Mark as done'));
    await waitFor(() => expect(state().status['2026-10-28-1']).toBe('done'));
  });

  it('beyond the 4-week look-ahead shows the outline only', async () => {
    const plan = storePlan();
    const far = allWorkouts(plan).find((w) => w.date >= '2026-11-16');
    await renderWithQuery(<WorkoutScreen id={far?.id ?? ''} />);
    expect(
      await screen.findByText(
        'Details appear 4 weeks ahead – the plan keeps adapting to the workouts you complete.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Structure')).toBeNull();
    expect(screen.queryByText('Why this session')).toBeNull();
  });
});

describe('pause and resume', () => {
  it('pauses from today for a reason', async () => {
    storePlan();
    await renderWithQuery(<PauseScreen />);
    expect(await screen.findByText('Pause plan')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Illness'));
    await fireEvent.press(screen.getByText('Pause plan'));
    await waitFor(() =>
      expect(state().pauses).toEqual([
        { reason: 'illness', startDate: '2026-10-19', endDate: null },
      ]),
    );
    expect(router.back).toHaveBeenCalled();
  });

  it('resumes after 5 days with the first week at 80 %', async () => {
    const plan = storePlan();
    mock.store.plan = {
      ...(mock.store.plan as NonNullable<typeof mock.store.plan>),
      state: {
        ...state(),
        pauses: [{ reason: 'injury', startDate: '2026-11-18', endDate: null }],
      },
    };
    setToday('2026-11-23');
    jest.spyOn(ids, 'daysBetween').mockReturnValue(5);
    await renderWithQuery(<PauseScreen />);
    expect(
      await screen.findByText(
        'If you resume today, your first week back is at 80 % of your last full training week.',
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Resume today'));
    await waitFor(() => expect(state().pauses[0]?.endDate).toBe('2026-11-23'));
    const reference = plan.weeks.find((w) => w.startDate === '2026-11-02')?.load ?? 0;
    const resumed = state().plan.weeks.find((w) => w.startDate === '2026-11-23');
    expect(resumed?.targetLoad).toBe(Math.round(reference * 0.8));
  });

  it('the Plan tab shows the running pause', async () => {
    storePlan();
    mock.store.plan = {
      ...(mock.store.plan as NonNullable<typeof mock.store.plan>),
      state: {
        ...state(),
        pauses: [{ reason: 'holiday', startDate: '2026-10-21', endDate: null }],
      },
    };
    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByText('Plan paused since October 21 (Holiday).')).toBeOnTheScreen();
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
  });
});

describe('availability', () => {
  it('saves new availability and rebuilds the remaining weeks', async () => {
    storePlan();
    setToday('2026-11-04');
    await renderWithQuery(<AvailabilityScreen />);
    // Monday 60 → 0 min (4 × 15).
    for (let i = 0; i < 4; i++) {
      await fireEvent.press(await screen.findByLabelText('Monday, Decrease'));
    }
    expect(screen.getByLabelText('Monday: Rest')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Save and rebuild plan'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const stored = mock.store.plan;
    expect(stored?.input.availability.minutesPerDay[0]).toBe(0);
    expect(stored?.state.revision).toBe(1);
    const mondays = allWorkouts(stored?.state.plan as Plan).filter(
      (w) => w.date >= '2026-11-04' && w.weekday === 0,
    );
    expect(mondays).toEqual([]);
  });
});
