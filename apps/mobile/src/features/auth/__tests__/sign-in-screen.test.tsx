import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { supabase } from '@/data/supabase';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { SignInScreen } from '../screens/sign-in-screen';
import { useSessionStore } from '../session-store';

jest.mock('@/data/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: jest.fn(async () => ({ error: null })),
      verifyOtp: jest.fn(async () => ({ error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
}));
// No app manifest under Jest to read the URL scheme from.
jest.mock('expo-linking', () => ({
  ...jest.requireActual('expo-linking'),
  createURL: (path: string) => `peakr://${path}`,
}));
jest.mock('@/data/sync/sync-repository', () => ({ clearSyncedData: jest.fn() }));
jest.mock('@/data/sync/use-background-sync', () => ({
  requestSync: jest.fn(),
  useSyncStore: { getState: () => ({ status: 'idle' }) },
}));
jest.spyOn(router, 'replace').mockImplementation(() => undefined);

const auth = supabase!.auth as unknown as {
  signInWithOtp: jest.Mock;
  verifyOtp: jest.Mock;
};

describe('sign-in screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ session: null, ready: true });
  });

  it('rejects an invalid email without calling Supabase', async () => {
    await renderWithQuery(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
    await fireEvent.press(screen.getByText('Email me a sign-in link'));
    expect(await screen.findByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('sends a magic link, then signs in with the code from the email', async () => {
    await renderWithQuery(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), ' Runner@Example.com ');
    await fireEvent.press(screen.getByText('Email me a sign-in link'));

    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'runner@example.com',
      options: expect.objectContaining({ shouldCreateUser: true }),
    });
    expect(
      await screen.findByText(/We sent a sign-in link to runner@example.com/),
    ).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Code from the email'), '123456');
    await fireEvent.press(screen.getByText('Sign in with code'));
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: 'runner@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('leaves for Today once a session exists', async () => {
    useSessionStore.setState({ session: { user: { id: 'u1' } } as never });
    await renderWithQuery(<SignInScreen />);
    expect(router.replace).toHaveBeenCalledWith('/today');
  });

  it('offers Google sign-in (Apple appears on iOS only)', async () => {
    await renderWithQuery(<SignInScreen />);
    expect(screen.getByText('Continue with Google')).toBeOnTheScreen();
  });
});
