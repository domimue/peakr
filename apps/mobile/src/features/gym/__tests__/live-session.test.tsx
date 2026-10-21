import { serializeLive, type GymRoutine, type GymSession, type GymSet } from '@peakr/engine';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';

import { todayIso } from '@/data/ids';
import * as repo from '@/data/repositories/gym-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { GymScreen } from '../gym-screen';
import { useLiveSessionStore } from '../live-session-store';
import { HistoryScreen } from '../screens/history-screen';
import { ExerciseDetailScreen } from '../screens/library-screens';
import { LiveSessionScreen, setLabels } from '../screens/live-session-screen';
import { StatsScreen } from '../screens/stats-screen';
import { FinishScreen, SessionDetailScreen } from '../screens/summary-screens';
import { WorkoutScreen } from '../screens/workout-screen';
import { routineSession, startLiveSession } from '../session';

jest.mock('@/data/repositories/gym-repository');
jest.mock('@/data/repositories/strength-repository');
const mockAbsorbGym = jest.fn();
jest.mock('@/features/plan/queries', () => ({
  usePlan: () => ({ data: null, isPending: false }),
  usePlanActions: () => ({ absorbGym: mockAbsorbGym }),
}));

const mock = repo as unknown as typeof import('@/data/repositories/__mocks__/gym-repository');

const legs: GymRoutine = {
  id: 'r1',
  name: 'Legs',
  position: 0,
  durationMin: 40,
  exercises: [
    {
      id: 'a',
      exerciseId: 'goblet_squat',
      targetSets: 2,
      target: { kind: 'reps', min: 8, max: 12 },
      restSec: 90,
    },
    {
      id: 'b',
      exerciseId: 'plank',
      targetSets: 1,
      target: { kind: 'time', minSec: 30, maxSec: 45 },
      restSec: 45,
    },
  ],
};

const old: GymSession = {
  id: 'old',
  date: '2026-10-15',
  startedAt: Date.parse('2026-10-15T17:00:00Z'),
  endedAt: Date.parse('2026-10-15T17:45:00Z'),
  title: 'Legs',
  kind: 'detailed',
  source: 'app',
};
const oldSet = (id: string, over: Partial<GymSet> = {}): GymSet => ({
  id,
  sessionId: 'old',
  exerciseId: 'goblet_squat',
  setIndex: 0,
  setType: 'working',
  weightKg: 20,
  reps: 12,
  rpe: 8,
  completed: true,
  loggedAt: old.startedAt,
  ...over,
});

function seedHistory() {
  mock.store.routines = [legs];
  mock.store.sessions = [old];
  mock.store.sets = [oldSet('o1'), oldSet('o2', { setIndex: 1, rpe: 7 })];
}

/** A running session of the routine, as the start screen creates it. */
function startLegs(now = Date.now()) {
  const live = startLiveSession(
    routineSession(legs),
    { sessions: mock.store.sessions, sets: mock.store.sets },
    todayIso(),
    [],
    now,
  );
  useLiveSessionStore.getState().start(live);
  return live;
}

const live = () => useLiveSessionStore.getState().live;

beforeEach(() => {
  mock.resetStore();
  mockAbsorbGym.mockClear();
  useLiveSessionStore.setState({ live: null, hydrated: false, stale: false });
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'replace').mockImplementation(() => undefined);
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
  jest.spyOn(router, 'dismissTo').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('starting a session', () => {
  it('turns a routine into a live session pre-filled from last time', async () => {
    seedHistory();
    await renderWithQuery(<WorkoutScreen routineId="r1" />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/gym/live'));
    const session = live();
    expect(session).toMatchObject({ title: 'Legs', routineId: 'r1', sourceId: 'routine:r1' });
    const squat = session?.exercises[0];
    // All sets at the top of the range at RPE ≤ 8 → +5 % (lower body), back to 8 reps.
    expect(squat?.sets.map((s) => s.target)).toEqual([
      { reps: 8, weightKg: 21 },
      { reps: 8, weightKg: 21 },
    ]);
    expect(squat?.sets[0]?.previous).toMatchObject({ weightKg: 20, reps: 12 });
    expect(session?.exercises[1]).toMatchObject({ timed: true, restSec: 45 });
    // Saved at once: a kill right now loses nothing.
    expect(mock.liveStore.json).toContain('"routineId":"r1"');
  });

  it('starts an empty session', async () => {
    await renderWithQuery(<WorkoutScreen empty />);
    await waitFor(() => expect(live()?.exercises).toEqual([]));
    expect(live()?.title).toBe('Workout');
  });

  it('never replaces a running session without asking', async () => {
    seedHistory();
    startLegs();
    const running = live();
    await renderWithQuery(<WorkoutScreen templateId="strength.push" />);
    expect(await screen.findByText('A session is running')).toBeOnTheScreen();
    expect(live()).toBe(running);
    await fireEvent.press(screen.getByText('Discard it and start new'));
    expect(live()?.id).not.toBe(running?.id);
    expect(router.replace).toHaveBeenCalledWith('/gym/live');
  });

  it('shows a message for an unknown routine', async () => {
    await renderWithQuery(<WorkoutScreen routineId="gone" />);
    expect(await screen.findByText('This workout is no longer available.')).toBeOnTheScreen();
  });
});

describe('live session screen', () => {
  it('logs a set with the big keypad, starts the rest timer and estimates the 1RM', async () => {
    seedHistory();
    startLegs();
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValue({ granted: true, canAskAgain: true } as never);
    await renderWithQuery(<LiveSessionScreen />);

    // Greyed suggestion from the progression; last time shown as the value to beat.
    expect(await screen.findAllByText('Last: 20 × 12')).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText('Weight, Goblet squat, set 1'));
    for (const key of ['2', '2', '.', '5']) await fireEvent.press(screen.getByLabelText(key));
    expect(within(screen.getByTestId('keypad-value')).getByText('22.5')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Next'));
    // On to the reps of the same set.
    expect(live()?.exercises[0]?.sets[0]?.weightKg).toBe(22.5);
    await fireEvent.press(screen.getByLabelText('1'));
    await fireEvent.press(screen.getByLabelText('0'));
    await fireEvent.press(screen.getByText('Complete set ✓'));

    const set = live()?.exercises[0]?.sets[0];
    expect(set).toMatchObject({ completed: true, weightKg: 22.5, reps: 10 });
    expect(screen.getByTestId('rest-timer')).toBeOnTheScreen();
    expect(screen.getByText('1:30')).toBeOnTheScreen();
    // 22.5 × (1 + 10/30) = 30
    expect(screen.getByText('≈ 30 kg 1RM (estimate)')).toBeOnTheScreen();
    await waitFor(() =>
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({ body: 'Time for your next set of Goblet squat.' }),
        }),
      ),
    );

    await fireEvent.press(screen.getByText('+15 s'));
    expect(screen.getByText('1:45')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByLabelText('Skip rest')[0] as never);
    expect(screen.queryByTestId('rest-timer')).toBeNull();
    expect(live()?.rest).toBeNull();
  });

  it('a check alone logs the suggested values; set types and extra sets', async () => {
    seedHistory();
    startLegs();
    await renderWithQuery(<LiveSessionScreen />);
    await fireEvent.press(await screen.findByLabelText('Set 1 of Goblet squat done'));
    expect(live()?.exercises[0]?.sets[0]).toMatchObject({ weightKg: 21, reps: 8 });

    await fireEvent.press(screen.getByLabelText('Set 2, Working set'));
    expect(live()?.exercises[0]?.sets[1]?.setType).toBe('drop');
    await fireEvent.press(screen.getAllByText('Add set')[0] as never);
    expect(live()?.exercises[0]?.sets).toHaveLength(3);
    await fireEvent.press(screen.getAllByText('Remove last set')[0] as never);
    expect(live()?.exercises[0]?.sets).toHaveLength(2);
    expect(setLabels(live()?.exercises[0]?.sets ?? [])).toEqual(['1', 'D']);
  });

  it('asks before finishing without a set and before discarding', async () => {
    seedHistory();
    startLegs();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderWithQuery(<LiveSessionScreen />);
    await fireEvent.press(await screen.findByText('Finish workout'));
    expect(alert).toHaveBeenCalledWith('No set done yet', expect.any(String));
    expect(router.push).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Discard session'));
    const buttons = alert.mock.calls.at(-1)?.[2] ?? [];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
    expect(live()).toBeNull();
    expect(mock.liveStore.json).toBeNull();
  });

  it('restores the running session after the app was killed, with the elapsed time', async () => {
    seedHistory();
    const started = Date.now() - 5 * 60_000;
    startLegs(started);
    useLiveSessionStore.getState().dispatch({
      type: 'completeSet',
      entryId: live()?.exercises[0]?.entryId as string,
      setId: live()?.exercises[0]?.sets[0]?.id as string,
    });
    const saved = mock.liveStore.json;
    // The process dies: memory is gone, SQLite keeps the session.
    useLiveSessionStore.setState({ live: null, hydrated: false, stale: false });
    expect(saved).toBe(serializeLive(JSON.parse(saved as string).session));

    await renderWithQuery(<LiveSessionScreen />);
    expect(await screen.findByText('Legs')).toBeOnTheScreen();
    expect(screen.getByTestId('live-elapsed')).toHaveTextContent(/^5:0\d$/);
    expect(screen.getByText('1 of 3 sets done')).toBeOnTheScreen();
    expect(live()?.exercises[0]?.sets[0]?.completed).toBe(true);
  });

  it('adds an exercise mid-session with last time as the target', async () => {
    seedHistory();
    await renderWithQuery(<WorkoutScreen empty />);
    await waitFor(() => expect(live()).not.toBeNull());
    await renderWithQuery(<LiveSessionScreen />);
    await fireEvent.press(await screen.findByText('Add exercise'));
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. squat'), 'goblet');
    await fireEvent.press(await screen.findByText('Goblet squat'));
    expect(live()?.exercises[0]?.sets[0]?.previous).toMatchObject({ weightKg: 20, reps: 12 });
  });
});

describe('finishing', () => {
  it('summarises duration, volume, sets and new records, saves and feeds the plan', async () => {
    seedHistory();
    startLegs(Date.now() - 50 * 60_000);
    const s = live();
    const squat = s?.exercises[0];
    const dispatch = useLiveSessionStore.getState().dispatch;
    dispatch({
      type: 'updateSet',
      entryId: squat?.entryId as string,
      setId: squat?.sets[0]?.id as string,
      patch: { weightKg: 24, reps: 10 },
    });
    dispatch({
      type: 'completeSet',
      entryId: squat?.entryId as string,
      setId: squat?.sets[0]?.id as string,
    });

    await renderWithQuery(<FinishScreen />);
    expect(await screen.findByTestId('summary-volume')).toHaveTextContent(/240 kg/);
    expect(screen.getByTestId('summary-sets')).toHaveTextContent(/1/);
    expect(screen.getByTestId('summary-duration')).toHaveTextContent(/50 min/);
    expect(screen.getByText(/new record/)).toBeOnTheScreen();
    expect(screen.getByText('Goblet squat: heaviest set, 24 kg')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Note'), 'Felt strong');
    await fireEvent.press(screen.getByText('Save workout'));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalled());

    const saved = mock.store.sessions.find((x) => x.id === s?.id);
    expect(saved).toMatchObject({ kind: 'detailed', notes: 'Felt strong', routineId: 'r1' });
    expect(mock.store.sets.filter((x) => x.sessionId === s?.id)).toHaveLength(1);
    expect(mockAbsorbGym).toHaveBeenCalledWith(
      expect.objectContaining({ id: s?.id }),
      expect.any(Array),
      [],
    );
    expect(live()).toBeNull();
    expect(mock.liveStore.json).toBeNull();
  });
});

describe('history, statistics and exercise detail', () => {
  const sep: GymSession = {
    ...old,
    id: 'sep',
    date: '2026-09-30',
    startedAt: Date.parse('2026-09-30T17:00:00Z'),
  };

  it('groups sessions by month with totals and opens a session', async () => {
    seedHistory();
    mock.store.sessions = [old, sep];
    mock.store.sets = [...mock.store.sets, oldSet('s1', { sessionId: 'sep', weightKg: 16 })];
    await renderWithQuery(<HistoryScreen />);
    expect(await screen.findByText('October 2026')).toBeOnTheScreen();
    expect(screen.getByText('September 2026')).toBeOnTheScreen();
    expect(screen.getByText('1 session · 480 kg · 45 min')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByText('Legs')[0] as never);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/history/[id]',
      params: { id: 'old' },
    });
  });

  it('shows a stored session with its sets', async () => {
    seedHistory();
    await renderWithQuery(<SessionDetailScreen id="old" />);
    expect(await screen.findByTestId('summary-volume')).toHaveTextContent(/480 kg/);
    expect(screen.getAllByText(/20 × 12 kg/)).toHaveLength(2);
  });

  it('statistics: this week, volume and frequency charts, muscles against the band, body map', async () => {
    const today = todayIso();
    mock.store.sessions = [{ ...old, id: 'now', date: today }];
    mock.store.sets = [
      oldSet('n1', { sessionId: 'now' }),
      oldSet('n2', { sessionId: 'now', setIndex: 1 }),
      oldSet('n3', { sessionId: 'now', setIndex: 2, setType: 'warmup' }),
    ];
    await renderWithQuery(<StatsScreen />);
    expect(await screen.findByTestId('stats-sets')).toHaveTextContent(/2/);
    expect(screen.getByTestId('stats-volume')).toHaveTextContent(/480 kg/);
    expect(screen.getByTestId('muscle-quads')).toHaveTextContent(
      /2 sets \(target 10–20\).*below target/,
    );
    expect(screen.getByTestId('body-map-front')).toBeOnTheScreen();
    expect(screen.getByLabelText(/Body map of the muscles trained: .*Quads 2/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Previous week'));
    expect(screen.getByText('Last week')).toBeOnTheScreen();
    expect(screen.getByText('No working sets this week yet.')).toBeOnTheScreen();
  });

  it('exercise detail: records, the 1RM note and every past set', async () => {
    seedHistory();
    mock.store.sessions = [old, sep];
    mock.store.sets = [
      ...mock.store.sets,
      oldSet('s1', { sessionId: 'sep', weightKg: 16, reps: 10 }),
    ];
    await renderWithQuery(<ExerciseDetailScreen id="goblet_squat" />);
    const records = await screen.findByTestId('exercise-records');
    expect(within(records).getByText('20 × 12 kg')).toBeOnTheScreen();
    // 20 × (1 + 12/30) = 28
    expect(within(records).getByText('28 kg')).toBeOnTheScreen();
    expect(within(records).getByText('480 kg')).toBeOnTheScreen();
    expect(within(records).getByText(/are estimates/)).toBeOnTheScreen();
    expect(screen.getByText('20 × 12 · 20 × 12')).toBeOnTheScreen();
    expect(screen.getByText('16 × 10')).toBeOnTheScreen();
  });
});

describe('Gym tab', () => {
  it('offers to continue a running session', async () => {
    seedHistory();
    startLegs(Date.now() - 65_000);
    await renderWithQuery(<GymScreen />);
    expect(await screen.findByText('Running: Legs')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('gym-live-banner'));
    expect(router.push).toHaveBeenCalledWith('/gym/live');
  });

  it('starts empty or from a routine and shows this week’s muscles', async () => {
    mock.store.sessions = [{ ...old, id: 'now', date: todayIso() }];
    mock.store.sets = [oldSet('n1', { sessionId: 'now' })];
    await renderWithQuery(<GymScreen />);
    expect(await screen.findByText('Quads')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Empty session'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/gym/session', params: { empty: '1' } });
    await fireEvent.press(screen.getByText('From a routine'));
    expect(router.push).toHaveBeenCalledWith('/gym/routines');
  });
});
