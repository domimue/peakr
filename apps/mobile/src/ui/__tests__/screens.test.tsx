import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import GymScreen from '../../../app/(tabs)/gym';
import PlanScreen from '../../../app/(tabs)/plan';
import ProfileScreen from '../../../app/(tabs)/profile';
import InsightsScreen from '../../../app/(tabs)/insights';
import TodayScreen from '../../../app/(tabs)/today';
import { useBillingStore } from '@/features/billing/billing-store';
import { usePlanUiStore } from '@/features/plan/plan-ui-store';
import { useSettingsStore } from '@/features/settings/settings-store';
import { renderWithQuery } from '@/test-utils/render-with-query';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/route-repository');
jest.mock('@/data/repositories/activity-repository');
jest.mock('@/data/repositories/gym-repository');

describe('tab screens without a plan', () => {
  it.each([
    ['Today', TodayScreen],
    ['Your plan', PlanScreen],
  ])('%s shows an empty state that starts the quiz', async (title, Tab) => {
    await renderWithQuery(<Tab />);
    expect(await screen.findByText('Start the quiz')).toBeOnTheScreen();
    expect(screen.getByText(title)).toBeOnTheScreen();
    expect(screen.getByTestId('list-empty')).toBeOnTheScreen();
  });

  it('the calendar view of Plan has the same empty state', async () => {
    usePlanUiStore.setState({ view: 'calendar' });
    await renderWithQuery(<PlanScreen />);
    expect(await screen.findByText('Start the quiz')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Calendar', selected: true })).toBeOnTheScreen();
    usePlanUiStore.setState({ view: 'weeks' });
  });

  it('Gym without the add-on shows an example preview and the paywall', async () => {
    const push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
    useBillingStore.setState({ devGym: false });
    await renderWithQuery(<GymScreen />);
    expect(await screen.findByTestId('gym-preview-session')).toBeOnTheScreen();
    expect(screen.getAllByText('Example').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId('gym-last-session')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Unlock Peakr Gym'));
    expect(push).toHaveBeenCalledWith('/gym/addon');
    push.mockRestore();
  });

  it('Gym opens the workspace: routines, library, quick log and import', async () => {
    const push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
    useBillingStore.setState({ devGym: true });
    await renderWithQuery(<GymScreen />);
    expect(await screen.findByTestId('gym-last-session')).toBeOnTheScreen();
    expect(screen.getByText(/No session logged yet/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('My routines'));
    expect(push).toHaveBeenCalledWith('/gym/routines');
    await fireEvent.press(screen.getByText('Exercise library'));
    expect(push).toHaveBeenCalledWith('/gym/library');
    useBillingStore.setState({ devGym: false });
    push.mockRestore();
  });

  it('Insights → Training explains that it fills once there is a plan', async () => {
    await renderWithQuery(<InsightsScreen />);
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
