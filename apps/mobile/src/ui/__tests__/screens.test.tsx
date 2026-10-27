import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import GymScreen from '../../../app/(tabs)/gym';
import PlanScreen from '../../../app/(tabs)/plan';
import BodyScreen from '../../../app/(tabs)/body';
import NutritionScreen from '../../../app/(tabs)/nutrition';
import ProfileScreen from '../../../app/profile';
import SettingsScreen from '../../../app/settings';
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

  it('Plan → History explains that it fills once there is a plan', async () => {
    usePlanUiStore.setState({ view: 'history' });
    await renderWithQuery(<PlanScreen />);
    expect(
      await screen.findByText('Your progress appears here once you have a plan.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'History', selected: true })).toBeOnTheScreen();
    usePlanUiStore.setState({ view: 'weeks' });
  });

  it.each([
    ['Today', TodayScreen],
    ['Plan', PlanScreen],
    ['Gym', GymScreen],
    ['Nutrition', NutritionScreen],
    ['Body', BodyScreen],
  ])('%s has the profile icon top right; it opens Profile', async (_name, Tab) => {
    const push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
    await renderWithQuery(<Tab />);
    await fireEvent.press(await screen.findByLabelText('Profile and settings'));
    expect(push).toHaveBeenCalledWith('/profile');
    push.mockRestore();
  });

  it('Nutrition and Body show "coming soon" while the add-on is switched off; Body keeps health', async () => {
    await renderWithQuery(<NutritionScreen />);
    expect(await screen.findByTestId('nutrition-soon')).toBeOnTheScreen();
    await renderWithQuery(<BodyScreen />);
    expect(await screen.findByTestId('body-soon')).toBeOnTheScreen();
    expect(screen.getByText('Health')).toBeOnTheScreen();
  });

  it('Profile: the person, goal and plan, connections and subscription; Settings behind it', async () => {
    const push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
    await renderWithQuery(<ProfileScreen />);
    for (const [row, href] of [
      ['Personal data', '/profile/personal'],
      ['Heart-rate zones', '/training/zones'],
      ['Plan history', '/training/plan-history'],
      ['Connections', '/integrations'],
      ['Subscription', '/subscription'],
      ['Settings', '/settings'],
    ] as const) {
      await fireEvent.press(await screen.findByText(row));
      expect(push).toHaveBeenCalledWith(href);
    }
    // How the app behaves is not in Profile.
    expect(screen.queryByText('Theme')).not.toBeOnTheScreen();
    push.mockRestore();
  });

  it('opens the settings screens from grouped rows on the settings screen', async () => {
    const push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
    await renderWithQuery(<SettingsScreen />);
    // Dark is the default; light mode is optional.
    expect(useSettingsStore.getState().themePreference).toBe('dark');
    await fireEvent.press(await screen.findByText('Theme'));
    expect(push).toHaveBeenCalledWith('/settings/appearance');
    for (const [row, href] of [
      ['Notifications', '/settings/notifications'],
      ['Units', '/settings/units'],
      ['Haptics', '/settings/haptics'],
      ['Language', '/settings/language'],
      ['Privacy', '/settings/privacy'],
      ['Third-party notices', '/licenses'],
    ] as const) {
      await fireEvent.press(screen.getByText(row));
      expect(push).toHaveBeenCalledWith(href);
    }
    expect(await screen.findByText(/^0?7:00/)).toBeOnTheScreen();
    push.mockRestore();
  });
});
