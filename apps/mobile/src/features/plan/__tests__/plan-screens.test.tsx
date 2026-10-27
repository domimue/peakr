import { allWorkouts, findWorkout, generatePlan, type Plan } from '@peakr/engine';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';

import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as activityRepo from '@/data/repositories/activity-repository';
import * as repo from '@/data/repositories/plan-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { usePlanUiStore } from '../plan-ui-store';
import { AvailabilityScreen } from '../screens/availability-screen';
import { PauseScreen } from '../screens/pause-screen';
import { PlanScreen } from '../screens/plan-screen';
import { WorkoutScreen } from '../screens/workout-screen';
import { InsightsScreen } from '@/features/insights/insights-screen';
import { TodayScreen } from '../../today/today-screen';

/** The Plan tab with its calendar view selected. */
function renderCalendar() {
  usePlanUiStore.setState({ view: 'calendar' });
  return renderWithQuery(<PlanScreen />);
}

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/activity-repository');
jest.mock('@/data/repositories/route-repository');

const mock = repo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');
const activityMock =
  activityRepo as unknown as typeof import('@/data/repositories/__mocks__/activity-repository');

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
  activityMock.resetStore();
  usePlanUiStore.setState({ view: 'weeks', weekStart: null, feedback: null });
  setToday('2026-10-19');
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('Plan tab', () => {
  it('one card per week: range, "Week 1 of 17", types in words, progress, tags', async () => {
    storePlan();
    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByText('Oct 19 – Oct 25')).toBeOnTheScreen();
    expect(screen.getByText('Week 1 of 17 · Base')).toBeOnTheScreen();
    expect(screen.getByText('This week')).toBeOnTheScreen();
    expect(screen.getAllByText(/^Sessions 0\/\d+$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Distance 0\/\d+ km$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Recovery week').length).toBeGreaterThan(0);
    expect(screen.getByTestId('week-progress-0')).toBeOnTheScreen();
    // The bar's colours are named: week 2 = 2 easy runs, a long run, intervals, 2 strength.
    const week2 = within(screen.getByTestId('week-types-1'));
    expect(week2.getByText('2× Easy')).toBeOnTheScreen();
    expect(week2.getByText('Long')).toBeOnTheScreen();
    expect(week2.getByText('Intervals')).toBeOnTheScreen();
    expect(week2.getByText('2× Strength')).toBeOnTheScreen();
  });

  it('weeks expand to their days and sessions; the current week starts open', async () => {
    storePlan();
    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByTestId('week-0-day-2026-10-19')).toBeOnTheScreen();
    expect(screen.queryByTestId('week-1-day-2026-10-26')).toBeNull();
    expect(screen.getByTestId('week-toggle-1')).toBeCollapsed();

    await fireEvent.press(screen.getByTestId('week-toggle-1'));
    expect(screen.getByTestId('week-toggle-1')).toBeExpanded();
    const monday = within(screen.getByTestId('week-1-day-2026-10-26'));
    await fireEvent.press(monday.getByLabelText(/^Easy run, Easy, \d+–\d+ min/));
    expect(router.push).toHaveBeenCalledWith('/training/workout/2026-10-26-1');
    expect(
      within(screen.getByTestId('week-1-day-2026-10-30')).getByText('Rest day'),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('week-toggle-0'));
    expect(screen.queryByTestId('week-0-day-2026-10-19')).toBeNull();

    // "Open in calendar" switches the Plan tab to its calendar view at that week.
    // Week 1 is the only open week now.
    await fireEvent.press(screen.getByText('Open in calendar'));
    expect(usePlanUiStore.getState()).toMatchObject({ view: 'calendar', weekStart: '2026-10-26' });
    expect(await screen.findByTestId('calendar-week-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('calendar-week-0')).toBeNull();
  });

  it('the segmented control switches between weeks and calendar', async () => {
    storePlan();
    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByTestId('week-progress-0')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Calendar' }));
    expect(await screen.findByTestId('calendar-week-0')).toBeOnTheScreen();
    expect(screen.queryByTestId('week-progress-0')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Weeks' }));
    expect(await screen.findByTestId('week-progress-0')).toBeOnTheScreen();
  });

  it('ticks a week when every session is done or skipped', async () => {
    const plan = storePlan();
    const week1 = plan.weeks[0]?.workouts ?? [];
    mock.store.plan = {
      ...(mock.store.plan as NonNullable<typeof mock.store.plan>),
      state: {
        ...state(),
        status: Object.fromEntries(week1.map((w, i) => [w.id, i === 0 ? 'skipped' : 'done'])),
      },
    };
    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByLabelText('Week complete')).toBeOnTheScreen();
    expect(screen.getByText(`Sessions ${week1.length - 1}/${week1.length - 1}`)).toBeOnTheScreen();
  });
});

describe('Plan → Calendar', () => {
  it('weeks as sections with totals, days with typed chips; pages weeks', async () => {
    storePlan();
    await renderCalendar();
    expect(await screen.findByText('Oct 19 – Oct 25')).toBeOnTheScreen();
    expect(screen.getByText('Week 1 of 17 · Base')).toBeOnTheScreen();
    expect(screen.getByTestId('calendar-week-0')).toBeOnTheScreen();
    expect(screen.getByTestId('calendar-week-3')).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/^Week total: \d+–\d+ min · \d+ km$/)).toHaveLength(4);
    expect(screen.getByLabelText(/^Monday, October 19, Today$/)).toBeOnTheScreen();
    expect(screen.getByTestId('plan-card-0-0')).toBeOnTheScreen();
    // Type and duration range are written out, never only colour-coded.
    expect(
      screen.getAllByLabelText(/^Easy run, Easy, \d+–\d+ min · [\d.]+ km, Zone 2$/).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByTestId('type-bar-typeEasy').length).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText(/^Strength, Strength, \d+–\d+ min, Hard$/).length,
    ).toBeGreaterThan(1);
    expect(screen.getAllByLabelText(/^Intervals, Intervals, /).length).toBeGreaterThan(0);
    expect(screen.queryByText('Peakr strength – base')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Next week'));
    expect(usePlanUiStore.getState().weekStart).toBe('2026-10-26');
    expect(screen.queryByText('Oct 19 – Oct 25')).toBeNull();
    expect(screen.getByText('Today')).toBeOnTheScreen();

    await fireEvent.press(screen.getAllByLabelText(/^Easy run, Easy, /)[0] as never);
    expect(router.push).toHaveBeenCalledWith('/training/workout/2026-10-26-1');
  });

  it('empty days offer "add"', async () => {
    storePlan();
    await renderCalendar();
    // Friday has no available time in this plan.
    await fireEvent.press(await screen.findByLabelText('Add a session on Friday, October 23'));
    expect(router.push).toHaveBeenCalledWith('/coming-soon/addSession');
  });

  it('"reset week" undoes manual moves', async () => {
    storePlan();
    await renderWithQuery(<WorkoutScreen id="2026-10-28-1" startMoving />);
    await fireEvent.press(await screen.findByText('Tue, Oct 27'));
    await waitFor(() => expect(findWorkout(state().plan, '2026-10-28-1')?.date).toBe('2026-10-27'));

    usePlanUiStore.setState({ weekStart: '2026-10-26', feedback: null });
    await renderCalendar();
    await fireEvent.press(await screen.findByText('Reset week'));
    await waitFor(() => expect(findWorkout(state().plan, '2026-10-28-1')?.date).toBe('2026-10-28'));
    expect(findWorkout(state().plan, '2026-10-28-1')?.originalDate).toBeUndefined();
  });

  it('"this week is different" opens for that week', async () => {
    storePlan();
    await renderCalendar();
    await fireEvent.press((await screen.findAllByText('This week is different'))[0] as never);
    expect(router.push).toHaveBeenCalledWith('/training/week?start=2026-10-19');
  });
});

describe('Today tab', () => {
  it("week strip, today's session, the week's progress; marks it done with haptics", async () => {
    storePlan();
    setToday('2026-10-26');
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByTestId('week-strip')).toBeOnTheScreen();
    expect(screen.getByLabelText('Monday, October 26, Today, Easy')).toBeOnTheScreen();
    expect(screen.getByLabelText('Tuesday, October 27, Strength')).toBeOnTheScreen();
    expect(screen.getByLabelText('Friday, October 30, Rest day')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Easy run, Easy, /)).toBeOnTheScreen();
    expect(screen.getByTestId('weather-chip')).toBeOnTheScreen();
    expect(screen.getByTestId('insights')).toBeOnTheScreen();
    expect(screen.getByText('Sessions 0/6')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Mark as done'));
    await waitFor(() => expect(state().status['2026-10-26-1']).toBe('done'));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(await screen.findByText('Sessions 1/6')).toBeOnTheScreen();
  });

  it('a rest day says so and offers the week', async () => {
    storePlan();
    setToday('2026-10-30');
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByText('Rest day')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('See this week'));
    expect(router.push).toHaveBeenCalledWith('/plan');
    expect(usePlanUiStore.getState().view).toBe('calendar');
  });

  it('before the plan starts it names the start date', async () => {
    storePlan();
    setToday('2026-10-15');
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByText('Your plan starts on Monday, October 19.')).toBeOnTheScreen();
  });
});

describe('Progress tab', () => {
  it('history by month with totals; performance with chart, bests and lifetime', async () => {
    storePlan();
    setToday('2026-10-28');
    mock.store.plan = {
      ...(mock.store.plan as NonNullable<typeof mock.store.plan>),
      state: {
        ...state(),
        status: { '2026-10-19-1': 'done', '2026-10-26-1': 'done', '2026-10-27-1': 'done' },
      },
    };
    await renderWithQuery(<InsightsScreen />);
    expect(await screen.findByText('October 2026')).toBeOnTheScreen();
    expect(screen.getByText(/^3 sessions · /)).toBeOnTheScreen();
    expect(screen.getAllByText(/^\d+:\d\d \/km$/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByLabelText(/^Easy run, Easy, Mon, Oct 26/));
    expect(router.push).toHaveBeenCalledWith('/training/workout/2026-10-26-1');

    await fireEvent.press(screen.getByText('Records'));
    expect(screen.getAllByLabelText('Sessions: 3').length).toBeGreaterThan(0);
    expect(
      screen.getByLabelText(/^Bar chart of the last 12 weeks: average \d+ minutes/),
    ).toBeOnTheScreen();
    expect(screen.getByText('Longest session')).toBeOnTheScreen();
    expect(screen.getByText('Longest run')).toBeOnTheScreen();
    expect(screen.getByText('Lifetime')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('4 weeks'));
    expect(screen.getByLabelText(/^Bar chart of the last 4 weeks/)).toBeOnTheScreen();
  });

  it('clear empty states without completed sessions', async () => {
    storePlan();
    await renderWithQuery(<InsightsScreen />);
    expect(await screen.findByText('No completed sessions yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Records'));
    expect(screen.getByText('No completed sessions in this period.')).toBeOnTheScreen();
    expect(
      screen.getByText('Your bests appear after your first completed session.'),
    ).toBeOnTheScreen();
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

    await renderCalendar();
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

    await renderCalendar();
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
    await renderCalendar();
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
  it('shows the synced activity that fulfilled the session', async () => {
    storePlan();
    setToday('2026-10-26');
    activityMock.store.activities = [
      {
        source: 'strava',
        externalId: '42',
        sport: 'run',
        startTime: '2026-10-26T05:30:00Z',
        date: '2026-10-26',
        durationSec: 3120,
        distanceM: 10_340,
        elevationGainM: 35,
        avgHr: 141.6,
        maxHr: 165,
        swimPaceSecPer100m: null,
        polyline: 'abc',
        name: 'Morning run',
        indoor: false,
        commute: false,
        summary: false,
        rpe: null,
        importedAt: Date.parse('2026-10-26T06:40:00Z'),
        handled: true,
      },
    ];
    activityMock.store.links = [
      { activityKey: 'strava:42', workoutId: '2026-10-26-1', planId: 'plan-1' },
    ];
    await renderWithQuery(<WorkoutScreen id="2026-10-26-1" />);
    const line = await screen.findByTestId('activity-synced');
    expect(line).toHaveTextContent(/^Synced from Strava · .+ · 52 min · 10\.3 km · ⌀ 142 bpm$/);
  });

  it('easy run: tinted header, range, HR target with a pace limit, numbered steps, done', async () => {
    storePlan();
    setToday('2026-10-26');
    await renderWithQuery(<WorkoutScreen id="2026-10-26-1" />);
    expect(await screen.findByText('Steps')).toBeOnTheScreen();
    expect(screen.getByTestId('workout-header')).toBeOnTheScreen();
    expect(screen.getByText('Easy run')).toBeOnTheScreen();
    expect(screen.getByText('Week 2 of 17 · Monday, October 26')).toBeOnTheScreen();
    expect(screen.getByTestId('duration-range')).toHaveTextContent(/^\d+–\d+ min$/);
    expect(screen.getByText(/^≈ [\d.]+ km$/)).toBeOnTheScreen();
    expect(screen.getByText('Not sent to a watch yet')).toBeOnTheScreen();
    expect(
      screen.getByText(
        /^Heart rate is your target\. Pace is a limit: no faster than \d+:\d\d \/km\.$/,
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getAllByText(/^Easy · \d+–\d+ bpm \(Zone 2\) · no faster than \d+:\d\d \/km$/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('step-1')).toBeOnTheScreen();
    expect(screen.getByText('Why this session')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Easy run explained'));
    expect(router.push).toHaveBeenCalledWith('/training/workout-types?focus=run.easy');

    await fireEvent.press(screen.getByText('Mark as done'));
    await waitFor(() => expect(state().status['2026-10-26-1']).toBe('done'));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    await fireEvent.press(await screen.findByText('Back to planned'));
    await waitFor(() => expect(state().status).toEqual({}));
  });

  it('indoor swaps the steps for the treadmill version; quick actions', async () => {
    storePlan();
    await renderWithQuery(<WorkoutScreen id="2026-10-26-1" />);
    await fireEvent.press(await screen.findByText('Treadmill'));
    expect(
      screen.getByText('Treadmill at 1 % incline – same steps and load as outside.'),
    ).toBeOnTheScreen();

    // Indoors the session can go to Zwift as a .zwo file through the share sheet.
    const write = jest.fn();
    jest
      .mocked(File)
      .mockImplementationOnce(
        (_dir: unknown, name: unknown) =>
          ({ create: jest.fn(), write, uri: `cache/${String(name)}` }) as never,
      );
    await fireEvent.press(screen.getByText('Send to Zwift'));
    await waitFor(() =>
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        expect.stringMatching(/\.zwo$/),
        expect.objectContaining({ mimeType: 'application/xml', UTI: 'public.xml' }),
      ),
    );
    expect(new TextDecoder().decode(write.mock.calls[0]?.[0] as Uint8Array)).toContain(
      '<workout_file>',
    );
    expect(screen.queryByText('The file could not be shared. Try again.')).toBeNull();
    expect(screen.queryAllByText(/no faster than \d+:\d\d \/km$/)).toHaveLength(0);
    await fireEvent.press(screen.getByText('Outdoor'));
    expect(screen.getAllByText(/no faster than \d+:\d\d \/km$/).length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByLabelText('Choose route'));
    expect(router.push).toHaveBeenCalledWith('/training/route/2026-10-26-1');
    await fireEvent.press(screen.getByLabelText('Link activity'));
    expect(router.push).toHaveBeenCalledWith('/coming-soon/linkActivity');
    await fireEvent.press(screen.getByLabelText('Warm-up'));
    expect(screen.getByText('Warm-up routine')).toBeOnTheScreen();
  });

  it('intervals: pace is the target, repeats are one numbered step', async () => {
    storePlan();
    await renderWithQuery(<WorkoutScreen id="2026-11-01-1" />);
    expect(await screen.findByText('Steps')).toBeOnTheScreen();
    expect(screen.queryByTestId('hr-first')).toBeNull();
    expect(screen.getAllByText(/^Main set · \d+ × /).length).toBeGreaterThan(0);
  });

  it('skips from the quick actions; the concrete session is in the subtitle', async () => {
    storePlan();
    await renderWithQuery(<WorkoutScreen id="2026-10-27-1" />);
    expect(await screen.findByText('Strength · Peakr strength – base')).toBeOnTheScreen();
    expect(screen.queryByText('Treadmill')).toBeNull();
    expect(screen.queryByLabelText('Choose route')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Skip'));
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
    expect(screen.queryByText('Steps')).toBeNull();
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

  it('Today shows the running pause, the calendar marks paused days', async () => {
    storePlan();
    mock.store.plan = {
      ...(mock.store.plan as NonNullable<typeof mock.store.plan>),
      state: {
        ...state(),
        pauses: [{ reason: 'holiday', startDate: '2026-10-21', endDate: null }],
      },
    };
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByText('Plan paused since October 21 (Holiday).')).toBeOnTheScreen();
    await renderCalendar();
    expect((await screen.findAllByText('Paused')).length).toBeGreaterThan(0);
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
