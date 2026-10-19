import { fireEvent, render, screen } from '@testing-library/react-native';

import PlanScreen from '../../../app/(tabs)/plan';
import ProfileScreen from '../../../app/(tabs)/profile';
import { useSettingsStore } from '@/features/settings/settings-store';
import { renderWithQuery } from '@/test-utils/render-with-query';

jest.mock('@/data/repositories/plan-repository');

describe('tab screens', () => {
  it('renders the plan screen from i18n keys (no plan yet)', async () => {
    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByText('Your plan')).toBeOnTheScreen();
    expect(screen.getByText('Start the quiz')).toBeOnTheScreen();
  });

  it('switches the theme preference on the profile screen', async () => {
    await render(<ProfileScreen />);
    // Dark is the default; light mode is optional.
    expect(useSettingsStore.getState().themePreference).toBe('dark');
    await fireEvent.press(screen.getByText('Light'));
    expect(useSettingsStore.getState().themePreference).toBe('light');
  });
});
