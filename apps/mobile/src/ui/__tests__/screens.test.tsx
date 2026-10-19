import { fireEvent, screen } from '@testing-library/react-native';

import CalendarScreen from '../../../app/(tabs)/calendar';
import PlanScreen from '../../../app/(tabs)/plan';
import ProfileScreen from '../../../app/(tabs)/profile';
import ProgressScreen from '../../../app/(tabs)/progress';
import TodayScreen from '../../../app/(tabs)/today';
import { useSettingsStore } from '@/features/settings/settings-store';
import { renderWithQuery } from '@/test-utils/render-with-query';

jest.mock('@/data/repositories/plan-repository');

describe('tab screens without a plan', () => {
  it.each([
    ['Today', TodayScreen],
    ['Your plan', PlanScreen],
    ['Calendar', CalendarScreen],
  ])('%s shows an empty state that starts the quiz', async (title, Tab) => {
    await renderWithQuery(<Tab />);
    expect(await screen.findByText('Start the quiz')).toBeOnTheScreen();
    expect(screen.getByText(title)).toBeOnTheScreen();
    expect(screen.getByTestId('list-empty')).toBeOnTheScreen();
  });

  it('Progress explains that it fills once there is a plan', async () => {
    await renderWithQuery(<ProgressScreen />);
    expect(
      await screen.findByText('Your progress appears here once you have a plan.'),
    ).toBeOnTheScreen();
  });

  it('switches the theme preference on the profile screen', async () => {
    await renderWithQuery(<ProfileScreen />);
    // Dark is the default; light mode is optional.
    expect(useSettingsStore.getState().themePreference).toBe('dark');
    await fireEvent.press(await screen.findByText('Light'));
    expect(useSettingsStore.getState().themePreference).toBe('light');
  });
});
