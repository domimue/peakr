import type { Session } from '@supabase/supabase-js';
import { render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useSessionStore } from '@/features/auth/session-store';

import { OpenLinkScreen } from '../open-link-screen';
import { savePendingLink } from '../pending-link';

jest.mock('@/data/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
}));
jest.mock('../pending-link', () => ({ savePendingLink: jest.fn() }));
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: jest.fn(),
}));

const params = jest.mocked(useLocalSearchParams);
const signedIn = { user: { id: 'user-1', is_anonymous: false } } as unknown as Session;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(router, 'replace').mockImplementation(() => undefined);
});

it('waits for the stored session before opening anything', () => {
  useSessionStore.setState({ session: null, isAnonymous: false, ready: false });
  params.mockReturnValue({ path: ['plan'] });
  render(<OpenLinkScreen />);
  expect(router.replace).not.toHaveBeenCalled();
});

it('opens the target for a signed-in account', async () => {
  useSessionStore.setState({ session: signedIn, isAnonymous: false, ready: true });
  params.mockReturnValue({ path: ['workout', 'w1'] });
  render(<OpenLinkScreen />);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/training/workout/w1'));
});

it('remembers the target and asks for the sign-in without an account', async () => {
  useSessionStore.setState({ session: null, isAnonymous: false, ready: true });
  params.mockReturnValue({ path: 'subscription' });
  render(<OpenLinkScreen />);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/sign-in'));
  expect(savePendingLink).toHaveBeenCalledWith('/subscription');
});

it('falls back to Today for an unknown link', async () => {
  useSessionStore.setState({ session: signedIn, isAnonymous: false, ready: true });
  params.mockReturnValue({ path: ['dev', 'plan'] });
  render(<OpenLinkScreen />);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/today'));
});
