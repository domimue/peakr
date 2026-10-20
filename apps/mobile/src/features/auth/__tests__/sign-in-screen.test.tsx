import type { Session } from '@supabase/supabase-js';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { setReconnectHint } from '@/data/repositories/baseline-repository';
import { supabase } from '@/data/supabase';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { SignInScreen } from '../screens/sign-in-screen';
import { useSessionStore } from '../session-store';

jest.mock('@/data/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: jest.fn(async () => ({ error: null })),
      verifyOtp: jest.fn(async () => ({ error: null })),
      updateUser: jest.fn(async () => ({ data: {}, error: null })),
      signOut: jest.fn(async () => ({ error: null })),
      signInWithOAuth: jest.fn(async () => ({
        data: { url: 'https://auth/sign-in' },
        error: null,
      })),
      linkIdentity: jest.fn(async () => ({ data: { url: 'https://auth/link' }, error: null })),
      exchangeCodeForSession: jest.fn(async () => ({ error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    functions: { invoke: jest.fn(async () => ({ data: { ok: true }, error: null })) },
  },
}));
// No app manifest under Jest to read the URL scheme from.
jest.mock('expo-linking', () => ({
  ...jest.requireActual('expo-linking'),
  createURL: (path: string) => `peakr://${path}`,
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('@/data/repositories/baseline-repository');
jest.mock('@/data/sync/sync-repository', () => ({ clearSyncedData: jest.fn() }));
jest.mock('@/data/sync/use-background-sync', () => ({
  requestSync: jest.fn(),
  useSyncStore: { getState: () => ({ status: 'idle' }) },
}));
jest.spyOn(router, 'replace').mockImplementation(() => undefined);

const auth = supabase!.auth as unknown as Record<
  | 'signInWithOtp'
  | 'verifyOtp'
  | 'updateUser'
  | 'signOut'
  | 'signInWithOAuth'
  | 'linkIdentity'
  | 'exchangeCodeForSession',
  jest.Mock
>;
const invoke = supabase!.functions.invoke as jest.Mock;
const openAuthSession = jest.mocked(WebBrowser.openAuthSessionAsync);

const anonymous = () =>
  useSessionStore.setState({
    session: { user: { id: 'anon-1', is_anonymous: true } } as unknown as Session,
    isAnonymous: true,
    ready: true,
  });

async function sendLink(email: string) {
  await renderWithQuery(<SignInScreen />);
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.press(screen.getByText('Email me a sign-in link'));
}

describe('sign-in screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ session: null, isAnonymous: false, ready: true });
  });

  it('rejects an invalid email without calling Supabase', async () => {
    await sendLink('not-an-email');
    expect(await screen.findByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('sends a magic link, then signs in with the code from the email', async () => {
    await sendLink(' Runner@Example.com ');

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

  it('leaves for Today once an account is signed in', async () => {
    useSessionStore.setState({ session: { user: { id: 'u1' } } as never });
    await renderWithQuery(<SignInScreen />);
    expect(router.replace).toHaveBeenCalledWith('/today');
  });

  it('offers Google sign-in (Apple appears on iOS only)', async () => {
    await renderWithQuery(<SignInScreen />);
    expect(screen.getByText('Continue with Google')).toBeOnTheScreen();
  });

  describe('with an anonymous quiz session', () => {
    beforeEach(anonymous);

    it('stays on sign-in (an anonymous session is not an account)', async () => {
      await renderWithQuery(<SignInScreen />);
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('converts the anonymous user by adding the email, not with a new sign-in', async () => {
      await sendLink('runner@example.com');

      expect(auth.updateUser).toHaveBeenCalledWith(
        { email: 'runner@example.com' },
        { emailRedirectTo: 'peakr://auth/callback' },
      );
      expect(auth.signInWithOtp).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
      expect(
        await screen.findByText(/We sent a link to runner@example.com to confirm your email/),
      ).toBeOnTheScreen();

      await fireEvent.changeText(screen.getByLabelText('Code from the email'), '654321');
      await fireEvent.press(screen.getByText('Sign in with code'));
      expect(auth.verifyOtp).toHaveBeenCalledWith({
        email: 'runner@example.com',
        token: '654321',
        type: 'email_change',
      });
    });

    it('deletes the anonymous user and signs in normally when the email has an account', async () => {
      auth.updateUser.mockResolvedValueOnce({
        data: {},
        error: { code: 'email_exists', status: 422 },
      });
      await sendLink('runner@example.com');

      expect(invoke).toHaveBeenCalledWith('delete-account', { body: {} });
      expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(setReconnectHint).toHaveBeenCalled();
      expect(auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'runner@example.com',
        options: expect.objectContaining({ shouldCreateUser: true }),
      });
      expect(
        await screen.findByText(/We sent a sign-in link to runner@example.com/),
      ).toBeOnTheScreen();
    });

    it('does not sign in normally when deleting the anonymous user failed', async () => {
      auth.updateUser.mockResolvedValueOnce({ data: {}, error: { code: 'email_exists' } });
      invoke.mockResolvedValueOnce({ data: null, error: { context: { status: 500 } } });
      await sendLink('runner@example.com');

      expect(auth.signInWithOtp).not.toHaveBeenCalled();
      expect(setReconnectHint).not.toHaveBeenCalled();
      expect(await screen.findByText('Sign-in didn’t work. Please try again.')).toBeOnTheScreen();
    });

    it('links Google to the anonymous user', async () => {
      openAuthSession.mockResolvedValueOnce({
        type: 'success',
        url: 'peakr://auth/callback?code=c1',
      });
      await renderWithQuery(<SignInScreen />);
      await fireEvent.press(screen.getByText('Continue with Google'));

      expect(auth.linkIdentity).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' }),
      );
      expect(auth.signInWithOAuth).not.toHaveBeenCalled();
      expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('c1');
    });

    it('signs in to the existing account when the Google identity is taken', async () => {
      openAuthSession
        .mockResolvedValueOnce({
          type: 'success',
          url: 'peakr://auth/callback?error=server_error&error_code=identity_already_exists',
        })
        .mockResolvedValueOnce({ type: 'success', url: 'peakr://auth/callback?code=c2' });
      await renderWithQuery(<SignInScreen />);
      await fireEvent.press(screen.getByText('Continue with Google'));

      expect(invoke).toHaveBeenCalledWith('delete-account', { body: {} });
      expect(setReconnectHint).toHaveBeenCalled();
      expect(auth.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' }),
      );
      expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('c2');
    });
  });
});
