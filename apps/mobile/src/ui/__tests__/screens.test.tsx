import { fireEvent, render, screen } from '@testing-library/react-native';

import PlanScreen from '../../../app/(tabs)/plan';
import ProfileScreen from '../../../app/(tabs)/profile';
import { useSettingsStore } from '@/features/settings/settings-store';

describe('tab screens', () => {
  it('renders the plan screen from i18n keys', async () => {
    await render(<PlanScreen />);
    expect(screen.getByText('Your plan')).toBeOnTheScreen();
  });

  it('switches the theme preference on the profile screen', async () => {
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByText('Dark'));
    expect(useSettingsStore.getState().themePreference).toBe('dark');
  });
});
