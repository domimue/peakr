import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { todayIso } from '@/data/ids';
import * as repo from '@/data/repositories/strength-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { QuickLogScreen } from '../screens/quick-log-screen';
import { RoutineBuilderScreen } from '../screens/routine-builder-screen';
import { RoutineListScreen } from '../screens/routine-list-screen';
import { StrengthSetupScreen } from '../screens/strength-setup-screen';
import { StrengthWorkoutScreen } from '../screens/strength-workout-screen';

jest.mock('@/data/repositories/strength-repository');

// The in-memory mock (src/data/repositories/__mocks__).
const mock = repo as unknown as typeof import('@/data/repositories/__mocks__/strength-repository');

beforeEach(() => {
  mock.resetStore();
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'replace').mockImplementation(() => undefined);
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('Profile → Strength setup', () => {
  it('edits the saved setup; switching split keeps the days in range', async () => {
    mock.store.setup = {
      mode: 'split',
      split: 'pushPullLegs',
      equipment: 'gym',
      daysPerWeek: 5,
      priority: 'balanced',
    };
    await renderWithQuery(<StrengthSetupScreen />);
    expect(
      await screen.findByLabelText('How many strength days per week?: 5 days'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Runner's strength"));
    expect(screen.getByLabelText('How many strength days per week?: 2 days')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Bodyweight only'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mock.store.setup).toEqual({
      mode: 'split',
      split: 'runners',
      equipment: 'hotel',
      daysPerWeek: 2,
      priority: 'balanced',
    });
  });
});

describe('routines', () => {
  it('builds a routine from library and custom exercises', async () => {
    await renderWithQuery(<RoutineBuilderScreen id="new" />);
    await fireEvent.press(await screen.findByText('Save routine'));
    expect(screen.getByText('Please fill in this field.')).toBeOnTheScreen();
    expect(mock.saveRoutine).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Legs at home');
    await fireEvent.press(screen.getByText('Add exercise'));
    await fireEvent.changeText(screen.getByLabelText('Search'), 'goblet');
    await fireEvent.press(screen.getByLabelText('Goblet squat'));

    // A custom exercise.
    await fireEvent.press(screen.getByText('Add exercise'));
    await fireEvent.press(screen.getByText('Create your own'));
    await fireEvent.press(screen.getByText('Save exercise'));
    expect(screen.getByText('Please fill in this field.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Sled push');
    await fireEvent.press(screen.getByText('Heavy'));
    await fireEvent.press(screen.getByText('Save exercise'));
    expect(await screen.findByLabelText('Sled push')).toBeOnTheScreen();
    expect(mock.store.customExercises[0]).toMatchObject({ name: 'Sled push', legLoad: 'heavy' });

    await fireEvent.changeText(screen.getAllByLabelText('Weight')[0]!, '20,5');
    await fireEvent.changeText(screen.getAllByLabelText('Reps or time')[1]!, '20 s');
    await fireEvent.press(screen.getAllByLabelText('Sets, Increase')[0]!);
    await fireEvent.press(screen.getAllByText('Up')[1]!);
    await fireEvent.press(screen.getByText('Save routine'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());

    const [routine] = mock.store.routines;
    expect(routine).toMatchObject({ name: 'Legs at home', durationMin: 45 });
    expect(routine?.exercises).toEqual([
      expect.objectContaining({
        exerciseId: mock.store.customExercises[0]?.id,
        reps: '20 s',
        sets: 3,
      }),
      expect.objectContaining({
        exerciseId: 'goblet_squat',
        reps: '8–12',
        sets: 4,
        weightKg: 20.5,
        restSec: 90,
      }),
    ]);
  });

  it('flags invalid weights and deletes existing routines', async () => {
    mock.store.routines = [
      {
        id: 'r1',
        name: 'Upper',
        durationMin: 40,
        exercises: [{ exerciseId: 'push_up', sets: 3, reps: '10' }],
      },
    ];
    await renderWithQuery(<RoutineBuilderScreen id="r1" />);
    await fireEvent.changeText(await screen.findByLabelText('Weight'), 'heavy');
    expect(
      screen.getByText('Enter a weight in kg, or leave empty for bodyweight.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Remove'));
    await fireEvent.press(screen.getByText('Delete routine'));
    await waitFor(() => expect(mock.store.routines).toEqual([]));
  });

  it('lists routines with start and edit', async () => {
    mock.store.routines = [
      {
        id: 'r1',
        name: 'Upper',
        durationMin: 40,
        exercises: [{ exerciseId: 'push_up', sets: 3, reps: '10' }],
      },
    ];
    await renderWithQuery(<RoutineListScreen />);
    expect(await screen.findByText('1 exercise · 40 min')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Start'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/strength/workout',
      params: { routineId: 'r1' },
    });
    await fireEvent.press(screen.getByText('Edit'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/strength/routines/[id]',
      params: { id: 'r1' },
    });
  });
});

describe('strength workout', () => {
  it('pre-fills from last time and logs done sets', async () => {
    mock.store.routines = [
      {
        id: 'r1',
        name: 'Legs',
        durationMin: 40,
        exercises: [
          { exerciseId: 'goblet_squat', sets: 2, reps: '8–12' },
          { exerciseId: 'plank', sets: 1, reps: '30–45 s' },
        ],
      },
    ];
    mock.store.logs = [
      {
        id: 'old',
        date: '2026-10-15',
        title: 'Legs',
        sourceId: 'routine:r1',
        createdAt: 1,
        log: {
          kind: 'detailed',
          durationMin: 40,
          sets: [
            { exerciseId: 'goblet_squat', weightKg: 20, reps: 12, rpe: 8 },
            { exerciseId: 'goblet_squat', weightKg: 20, reps: 12, rpe: 7 },
          ],
        },
      },
    ];
    await renderWithQuery(<StrengthWorkoutScreen routineId="r1" />);
    expect(await screen.findByText('Last time: 20 kg × 12, 20 kg × 12')).toBeOnTheScreen();
    // All sets at the top of the range at RPE ≤ 8 → +5 % (lower body), back to 8 reps.
    expect(screen.getByLabelText('Weight in kg, Goblet squat, set 1')).toHaveDisplayValue('21');
    expect(screen.getByLabelText('reps, Goblet squat, 1')).toHaveDisplayValue('8');
    expect(screen.getByLabelText('sec, Plank, 1')).toHaveDisplayValue('30');

    await fireEvent.press(screen.getAllByText('How to')[0]!);
    expect(screen.getByText(/Hold a dumbbell or kettlebell/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Finish workout'));
    expect(
      screen.getByText('Tick at least one set as done, or use the quick log.'),
    ).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('RPE, Goblet squat, set 1'), '7.5');
    await fireEvent.press(screen.getByLabelText('Set 1 of Goblet squat done'));
    await fireEvent.press(screen.getByLabelText('Set 1 of Plank done'));
    await fireEvent.press(screen.getByText('Finish workout'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());

    const saved = mock.store.logs.find((l) => l.id !== 'old');
    expect(saved).toMatchObject({ date: todayIso(), title: 'Legs', sourceId: 'routine:r1' });
    expect(saved?.log).toEqual({
      kind: 'detailed',
      durationMin: 40,
      sets: [
        { exerciseId: 'goblet_squat', weightKg: 21, reps: 8, rpe: 7.5 },
        { exerciseId: 'plank', weightKg: undefined, durationSec: 30, rpe: undefined },
      ],
    });
  });

  it('starts library sessions in the user’s equipment and offers the quick log', async () => {
    mock.store.setup = { mode: 'split', split: 'pushPullLegs', equipment: 'hotel' };
    await renderWithQuery(<StrengthWorkoutScreen templateId="strength.legs" />);
    expect(await screen.findByText('Legs')).toBeOnTheScreen();
    expect(screen.queryByText('Back squat')).toBeNull();
    await fireEvent.press(screen.getByText('Quick log instead'));
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/strength/quick-log',
      params: { sourceId: 'strength.legs' },
    });
  });

  it('shows a message for an unknown routine', async () => {
    await renderWithQuery(<StrengthWorkoutScreen routineId="gone" />);
    expect(await screen.findByText('This workout is no longer available.')).toBeOnTheScreen();
  });
});

describe('quick log', () => {
  it('logs duration, effort and legs', async () => {
    await renderWithQuery(<QuickLogScreen />);
    expect(screen.getByText('Counts as an easy day for spacing.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Yes'));
    await fireEvent.press(screen.getByLabelText('Effort (RPE 1–10), Increase'));
    expect(screen.getByText('Training load: 180')).toBeOnTheScreen();
    expect(screen.getByText('Counts as a hard day – the next day stays easy.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mock.store.logs[0]).toMatchObject({
      title: '',
      sourceId: null,
      log: { kind: 'quick', durationMin: 45, rpe: 8, legs: true },
    });
  });
});
