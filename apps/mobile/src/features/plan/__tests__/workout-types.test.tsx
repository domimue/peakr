import { generatePlan } from '@peakr/engine';
import { fireEvent, screen } from '@testing-library/react-native';

import type { StoredPlanInput } from '@/data/db/schema';
import * as repo from '@/data/repositories/plan-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { WorkoutTypesScreen } from '../screens/workout-types-screen';

jest.mock('@/data/repositories/plan-repository');

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
};

beforeEach(() => {
  mock.resetStore();
  const r = generatePlan(input.profile, input.goal, input.availability, '2026-10-19');
  if (!r.ok) throw new Error('plan');
  mock.store.plan = {
    id: 'plan-1',
    input,
    state: { plan: r.value, status: {}, pauses: [], revision: 0 },
  };
});

describe('workout types', () => {
  it('collapsed rows with the zone chip; a tap opens how and why', async () => {
    await renderWithQuery(<WorkoutTypesScreen />);
    expect(await screen.findByTestId('kind-run.easy')).toBeOnTheScreen();
    expect(screen.getByText('Z1–2 · 3–4/10')).toBeOnTheScreen();
    expect(screen.queryByTestId('kind-detail-run.easy')).toBeNull();
    await fireEvent.press(screen.getByLabelText(/^Easy run, Relaxed, conversational running/));
    expect(screen.getByTestId('kind-detail-run.easy')).toBeOnTheScreen();
    // The description does not say the one-liner again.
    expect(screen.queryByText(/hold a conversation/)).toBeNull();
  });

  it('only the own sports by default; "Show all", filter and collapsible sections', async () => {
    await renderWithQuery(<WorkoutTypesScreen />);
    expect(await screen.findByTestId('types-run')).toBeOnTheScreen();
    expect(screen.queryByTestId('types-swim')).toBeNull();
    await fireEvent(screen.getByTestId('types-show-all'), 'valueChange', true);
    expect(screen.getByTestId('types-swim')).toBeOnTheScreen();
    // The filter chip comes first, the section heading after it.
    await fireEvent.press(screen.getAllByText('Swimming')[0] as never);
    expect(screen.queryByTestId('types-run')).toBeNull();
    expect(screen.getByTestId('types-swim')).toBeOnTheScreen();
    // Collapse the section.
    await fireEvent.press(screen.getByRole('header', { name: 'Swimming' }));
    expect(screen.queryByTestId('kind-swim.easy')).toBeNull();
  });

  it('from a workout: its type open, its sport first – also outside the own sports', async () => {
    await renderWithQuery(<WorkoutTypesScreen focus="bike.tempo" />);
    expect(await screen.findByTestId('kind-detail-bike.tempo')).toBeOnTheScreen();
    expect(screen.getByTestId('types-bike')).toBeOnTheScreen();
  });
});
