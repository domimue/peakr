import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import * as repo from '@/data/repositories/strength-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { StrengthSetupScreen } from '../screens/strength-setup-screen';

jest.mock('@/data/repositories/strength-repository');

// The in-memory mock (src/data/repositories/__mocks__).
const mock = repo as unknown as typeof import('@/data/repositories/__mocks__/strength-repository');

beforeEach(() => {
  mock.resetStore();
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
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
