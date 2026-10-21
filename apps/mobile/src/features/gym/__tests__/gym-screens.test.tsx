import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';

import * as repo from '@/data/repositories/gym-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { GymScreen } from '../gym-screen';
import { ImportScreen } from '../screens/import-screen';
import {
  ExerciseDetailScreen,
  ExerciseEditScreen,
  LibraryScreen,
} from '../screens/library-screens';
import { QuickLogScreen } from '../screens/quick-log-screen';
import { RoutineBuilderScreen } from '../screens/routine-builder-screen';
import { RoutineListScreen } from '../screens/routine-list-screen';

jest.mock('@/data/repositories/gym-repository');
jest.mock('@/data/repositories/strength-repository');
const mockAbsorbGym = jest.fn();
jest.mock('@/features/plan/queries', () => ({
  usePlan: () => ({ data: null, isPending: false }),
  usePlanActions: () => ({ absorbGym: mockAbsorbGym }),
}));

// The in-memory mock (src/data/repositories/__mocks__).
const mock = repo as unknown as typeof import('@/data/repositories/__mocks__/gym-repository');

beforeEach(() => {
  mock.resetStore();
  mockAbsorbGym.mockClear();
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'replace').mockImplementation(() => undefined);
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

const upper = {
  id: 'r1',
  name: 'Upper',
  position: 0,
  durationMin: 40,
  exercises: [
    {
      id: 'e1',
      exerciseId: 'push_up',
      targetSets: 3,
      target: { kind: 'reps' as const, min: 10, max: 10 },
      restSec: 60,
    },
  ],
};

describe('Gym tab', () => {
  it('shows the last session and links to the workspace', async () => {
    mock.store.routines = [upper];
    mock.store.sessions = [
      {
        id: 's',
        date: '2026-10-19',
        startedAt: 1,
        endedAt: 2,
        title: 'Upper',
        kind: 'detailed',
        source: 'app',
      },
    ];
    mock.store.sets = [
      {
        id: 'x',
        sessionId: 's',
        exerciseId: 'bench_press',
        setIndex: 0,
        setType: 'working',
        weightKg: 60,
        reps: 10,
        completed: true,
        loggedAt: 1,
      },
    ];
    await renderWithQuery(<GymScreen />);
    expect(
      await screen.findByText('2026-10-19 · 0 min · 1 sets · 600 kg volume'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Upper')).toBeOnTheScreen();
    expect(screen.getByText('1 routine')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Import from another app'));
    expect(router.push).toHaveBeenCalledWith('/gym/import');
  });
});

describe('routine builder', () => {
  it('builds a routine with library and custom exercises, supersets and drag order', async () => {
    await renderWithQuery(<RoutineBuilderScreen id="new" />);
    await fireEvent.press(await screen.findByText('Save routine'));
    expect(screen.getByText('Please fill in this field.')).toBeOnTheScreen();
    expect(mock.saveGymRoutines).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Legs');
    await fireEvent.press(screen.getByText('Add exercise'));
    await fireEvent.changeText(screen.getByLabelText('Search'), 'leg ext');
    await fireEvent.press(screen.getByLabelText(/^Leg extension,/));

    // A custom exercise.
    await fireEvent.press(screen.getByText('Add exercise'));
    await fireEvent.press(screen.getByText('Create your own'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Sled push');
    await fireEvent.press(screen.getByText('Heavy'));
    await fireEvent.press(screen.getByText('Save exercise'));
    expect(await screen.findByLabelText('Sled push')).toBeOnTheScreen();
    expect(mock.store.exercises[0]).toMatchObject({ name: 'Sled push', legLoad: 'heavy' });

    await fireEvent.changeText(screen.getAllByLabelText('Weight')[0] as never, '40,5');
    await fireEvent.changeText(screen.getAllByLabelText('Reps or time')[1] as never, '20 m');
    await fireEvent.changeText(screen.getAllByLabelText('Target RPE')[0] as never, '8');
    await fireEvent.press(screen.getAllByLabelText('Sets, Increase')[0] as never);
    await fireEvent.press(screen.getByText('Superset with next'));
    expect(screen.getAllByText('Superset A')).toHaveLength(2);
    // Screen-reader reorder: the custom exercise moves up.
    await fireEvent(screen.getByTestId('routine-exercises-row-1'), 'accessibilityAction', {
      nativeEvent: { actionName: 'moveUp' },
    });
    await fireEvent.changeText(screen.getAllByLabelText('Reps or time')[0] as never, 'lots');
    expect(screen.getByText('e.g. 8–12, 10, 45 s or 20 m')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getAllByLabelText('Reps or time')[0] as never, '20 m');
    await fireEvent.press(screen.getByText('Save routine'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());

    const [routine] = mock.store.routines;
    expect(routine).toMatchObject({ name: 'Legs', position: 0 });
    const [first, second] = routine?.exercises ?? [];
    expect(first).toMatchObject({
      exerciseId: mock.store.exercises[0]?.id,
      target: { kind: 'distance', m: 20 },
      targetSets: 3,
    });
    expect(second).toMatchObject({
      exerciseId: 'leg_extension',
      target: { kind: 'reps', min: 8, max: 12 },
      targetSets: 4,
      weightKg: 40.5,
      targetRpe: 8,
    });
    expect(first?.supersetGroup).toBeDefined();
    expect(first?.supersetGroup).toBe(second?.supersetGroup);
  });

  it('flags invalid values, leaves a superset and deletes routines', async () => {
    mock.store.routines = [
      {
        ...upper,
        exercises: [
          { ...upper.exercises[0]!, supersetGroup: 'g' },
          { ...upper.exercises[0]!, id: 'e2', exerciseId: 'dips', supersetGroup: 'g' },
        ],
      },
    ];
    await renderWithQuery(<RoutineBuilderScreen id="r1" />);
    await fireEvent.changeText((await screen.findAllByLabelText('Weight'))[0] as never, 'heavy');
    expect(
      screen.getByText('Enter a weight in kg, or leave empty for bodyweight.'),
    ).toBeOnTheScreen();
    await fireEvent.changeText(screen.getAllByLabelText('Target RPE')[0] as never, '12');
    expect(screen.getByText('1–10')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByText('Leave superset')[0] as never);
    expect(screen.queryByText('Superset A')).toBeNull();
    await fireEvent.press(screen.getByText('Delete routine'));
    await waitFor(() => expect(mock.store.routines).toEqual([]));
  });
});

describe('routine list', () => {
  it('starts, edits, duplicates and archives routines', async () => {
    mock.store.routines = [upper];
    await renderWithQuery(<RoutineListScreen />);
    expect(await screen.findByText('1 exercise · 40 min')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Start'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/session',
      params: { routineId: 'r1' },
    });
    await fireEvent.press(screen.getByLabelText('Edit Upper'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/routines/[id]',
      params: { id: 'r1' },
    });

    await fireEvent.press(screen.getByLabelText('More actions for Upper'));
    await fireEvent.press(screen.getByText('Duplicate'));
    expect(await screen.findByText('Upper (copy)')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('More actions for Upper'));
    await fireEvent.press(screen.getByText('Archive'));
    await fireEvent.press(await screen.findByText('Show archived (1)'));
    expect(mock.store.routines.find((r) => r.id === 'r1')?.archivedAt).toBeDefined();
    await fireEvent.press(screen.getByText('Restore'));
    await waitFor(() =>
      expect(mock.store.routines.find((r) => r.id === 'r1')?.archivedAt).toBeUndefined(),
    );
  });

  it('offers starter routines on day one and manages folders', async () => {
    await renderWithQuery(<RoutineListScreen />);
    expect(await screen.findByTestId('starter-routines')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Push / pull / legs'));
    await waitFor(() => expect(mock.store.routines).toHaveLength(3));
    expect(mock.store.folders[0]?.name).toBe('Push / pull / legs');
    expect(mock.store.routines.map((r) => r.name)).toEqual(['Push', 'Pull', 'Legs']);
    expect(mock.store.routines.every((r) => r.folderId === mock.store.folders[0]?.id)).toBe(true);

    expect(await screen.findByText('Push')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('New folder'));
    await fireEvent.changeText(screen.getByLabelText('Folder name'), 'Winter');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mock.store.folders.map((f) => f.name)).toContain('Winter'));

    // Drag order: moving "Pull" to the top writes new positions.
    await fireEvent(
      screen.getByTestId(`routines-${mock.store.folders[0]?.id}-row-1`),
      'accessibilityAction',
      { nativeEvent: { actionName: 'moveUp' } },
    );
    await waitFor(() =>
      expect(mock.store.routines.find((r) => r.name === 'Pull')?.position).toBe(0),
    );
  });
});

describe('quick log', () => {
  it('logs duration, effort and legs and completes the planned workout', async () => {
    await renderWithQuery(<QuickLogScreen sourceId="strength.legs" workoutId="w1" />);
    expect(screen.getByText('Counts as an easy day for spacing.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Yes'));
    await fireEvent.press(screen.getByLabelText('Effort (RPE 1–10), Increase'));
    expect(screen.getByText('Training load: 180')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mock.store.sessions[0]).toMatchObject({
      kind: 'quick',
      durationMin: 45,
      sessionRpe: 8,
      legs: true,
      sourceId: 'strength.legs',
      plannedWorkoutId: 'w1',
    });
    // The session counts towards the plan's load and marks the planned workout done.
    expect(mockAbsorbGym).toHaveBeenCalledWith(mock.store.sessions[0], [], []);
  });
});

describe('exercise library', () => {
  it('searches by name and alias and filters by equipment', async () => {
    await renderWithQuery(<LibraryScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Search'), 'butterfly');
    expect(screen.getByLabelText(/^Pec deck,/)).toBeOnTheScreen();
    expect(screen.getByText('1 exercise')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Search'), 'press');
    await fireEvent.press(screen.getByText('Smith machine'));
    expect(screen.getByLabelText(/^Smith machine bench press,/)).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Bench press,/)).toBeNull();
    await fireEvent.press(screen.getByLabelText(/^Smith machine bench press,/));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/exercise/[id]',
      params: { id: 'smith_bench_press' },
    });
  });

  it('shows an exercise with cues and muscles', async () => {
    await renderWithQuery(<ExerciseDetailScreen id="leg_extension" />);
    expect(await screen.findByText('Leg extension')).toBeOnTheScreen();
    expect(
      screen.getByTestId('figure-leg_extension', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.getByText('• Knees line up with the pivot')).toBeOnTheScreen();
    expect(screen.getByText('Quads')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Edit a copy'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/exercise/edit',
      params: { copyOf: 'leg_extension' },
    });
  });

  it('saves an edited copy of a library exercise', async () => {
    await renderWithQuery(<ExerciseEditScreen copyOf="leg_extension" />);
    expect(await screen.findByDisplayValue('Leg extension (my version)')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByText('Calves')[0] as never);
    await fireEvent.press(screen.getByText('Save exercise'));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(mock.store.exercises[0]).toMatchObject({
      name: 'Leg extension (my version)',
      basedOn: 'leg_extension',
      pattern: 'legIsolation',
      primaryMuscles: ['quads', 'calves'],
      cues: expect.arrayContaining(['Pause at the top']),
    });
  });

  it('deletes own exercises', async () => {
    mock.store.exercises = [
      {
        id: 'custom:x',
        name: 'Sled push',
        pattern: 'squat',
        primaryMuscles: ['quads'],
        secondaryMuscles: [],
        muscles: ['quads'],
        equipment: ['machine'],
        legLoad: 'heavy',
        unilateral: false,
        trackingMode: 'distance',
      },
    ];
    await renderWithQuery(<ExerciseDetailScreen id="custom:x" />);
    await fireEvent.press(await screen.findByText('Delete exercise'));
    await waitFor(() => expect(mock.store.exercises).toEqual([]));
  });
});

describe('CSV import', () => {
  const HEVY = [
    '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"',
    '"Push","18 Jan 2026, 07:39","18 Jan 2026, 08:41","","Bench Press (Barbell)",,"",0,"normal",80,8,,,8',
    '"Push","18 Jan 2026, 07:39","18 Jan 2026, 08:41","","Sled Push",,"",0,"normal",120,,0.02,,',
    '"Legs","20 Jan 2026, 18:00","20 Jan 2026, 19:10","","Leg Extension (Machine)",,"",0,"normal",50,12,,,',
  ].join('\n');

  const pickFile = (text: string) => {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///x.csv', name: 'x.csv' }],
    } as never);
    jest
      .mocked(File)
      .mockImplementationOnce((() => ({ text: () => Promise.resolve(text) })) as never);
  };

  it('maps, matches and imports a Hevy export; unmatched names become own exercises', async () => {
    pickFile(HEVY);
    await renderWithQuery(<ImportScreen />);
    await fireEvent.press(screen.getByText('Choose CSV file'));
    expect(await screen.findByText('Hevy export detected')).toBeOnTheScreen();
    expect(screen.getByText('2 workouts, 3 sets')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Next: match exercises'));
    expect(
      await screen.findByText('2 exercises matched automatically, 1 to check.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Not in the library · 1 set')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Also create a routine for each workout name'));
    await fireEvent.press(screen.getByText('Import'));
    expect(await screen.findByTestId('import-done')).toBeOnTheScreen();
    expect(screen.getByText('2 workouts with 3 sets imported.')).toBeOnTheScreen();
    expect(screen.getByText('1 new own exercise created.')).toBeOnTheScreen();
    expect(screen.getByText('2 routines created.')).toBeOnTheScreen();

    expect(mock.store.sessions.map((s) => s.source)).toEqual(['import:hevy', 'import:hevy']);
    expect(mock.store.exercises.map((e) => e.name)).toEqual(['Sled Push']);
    expect(mock.store.folders.map((f) => f.name)).toEqual(['Imported']);
    expect(Object.values(mock.store.importNames)).toContain('bench_press');
  });

  it('skips workouts imported before', async () => {
    mock.store.sessions = ['Push|18 Jan 2026, 07:39', 'Legs|20 Jan 2026, 18:00'].map((key, i) => ({
      id: `s${i}`,
      date: '2026-01-18',
      startedAt: i,
      title: key,
      kind: 'detailed' as const,
      source: 'import:hevy' as const,
      externalId: `import:hevy:${key}`,
    }));
    pickFile(HEVY);
    await renderWithQuery(<ImportScreen />);
    await fireEvent.press(screen.getByText('Choose CSV file'));
    await fireEvent.press(await screen.findByText('Next: match exercises'));
    await fireEvent.press(await screen.findByText('Import'));
    expect(
      await screen.findByText('2 workouts were imported before and skipped.'),
    ).toBeOnTheScreen();
    expect(mock.store.sessions).toHaveLength(2);
  });

  it('asks for the columns of an unknown format and rejects empty files', async () => {
    pickFile('foo\n');
    await renderWithQuery(<ImportScreen />);
    await fireEvent.press(screen.getByText('Choose CSV file'));
    expect(await screen.findByTestId('import-error')).toBeOnTheScreen();

    pickFile('When;What;Kilo;Times\n15.03.2026 18:00;bench press;60;8\n');
    await fireEvent.press(screen.getByText('Choose CSV file'));
    expect(await screen.findByText('Unknown format – check the columns below.')).toBeOnTheScreen();
    expect(
      screen.getByText('Map these columns first: Date / start time, Exercise'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Next: match exercises')).toBeDisabled();
  });
});
