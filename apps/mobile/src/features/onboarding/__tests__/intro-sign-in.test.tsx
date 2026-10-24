import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderWithQuery } from '@/test-utils/render-with-query';

import { IntroScreen } from '../screens/intro-screen';

jest.mock('@/data/repositories/onboarding-repository');
jest.mock('@/features/auth/session-store', () => ({
  ...jest.requireActual('@/features/auth/session-store'),
  authAvailable: true,
}));

describe('onboarding intro with accounts', () => {
  it('lets someone with an account (e.g. bought on the website) sign in instead', async () => {
    jest.spyOn(router, 'push').mockImplementation(() => undefined);
    await renderWithQuery(<IntroScreen />);
    fireEvent.press(await screen.findByText('Already have an account? Sign in'));
    expect(router.push).toHaveBeenCalledWith('/auth/sign-in');
  });
});
