import type { Session } from '@supabase/supabase-js';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Network from 'expo-network';
import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';

import { clearAllLocalData } from '@/data/sync/sync-repository';
import { supabase } from '@/data/supabase';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { AccountScreen } from '../screens/account-screen';
import { useSessionStore } from '../session-store';

jest.mock('@/data/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    auth: {
      signOut: jest.fn(async () => ({ error: null })),
      getUser: jest.fn(async () => ({ data: { user: null }, error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
}));
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(),
}));
jest.mock('@/data/repositories/onboarding-repository');
jest.mock('@/data/repositories/baseline-repository');
jest.mock('@/data/sync/sync-repository', () => ({
  clearSyncedData: jest.fn(),
  clearAllLocalData: jest.fn(),
}));
jest.mock('@/data/sync/use-background-sync', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  return {
    requestSync: jest.fn(),
    useSyncStore: create(() => ({ status: 'idle', lastSyncedAt: null, error: null })),
  };
});
jest.spyOn(router, 'replace').mockImplementation(() => undefined);

const client = supabase as unknown as {
  functions: { invoke: jest.Mock };
  auth: { signOut: jest.Mock; getUser: jest.Mock };
};
const networkState = Network.getNetworkStateAsync as jest.Mock;

const session = { user: { id: 'user-1', email: 'runner@example.com' } } as unknown as Session;

async function openConfirmation() {
  await renderWithQuery(<AccountScreen />);
  await fireEvent.press(screen.getByText('Delete account'));
}

describe('account screen – delete account', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ session, ready: true });
    networkState.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    client.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it('explains what happens and only enables deletion after typing DELETE', async () => {
    await openConfirmation();
    expect(screen.getByText(/does not cancel an active subscription/)).toBeOnTheScreen();
    expect(screen.getByText(/This can’t be undone/)).toBeOnTheScreen();

    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    if (Platform.OS === 'ios') {
      await fireEvent.press(screen.getByText('Open App Store subscriptions'));
      expect(openUrl).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');
    } else {
      await fireEvent.press(screen.getByText('Open Google Play subscriptions'));
      expect(openUrl).toHaveBeenCalledWith('https://play.google.com/store/account/subscriptions');
    }

    const confirm = screen.getByRole('button', { name: 'Delete account permanently' });
    expect(confirm).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'delete');
    expect(confirm).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    expect(confirm).toBeEnabled();
  });

  it('deletes on the server, wipes the phone, signs out and returns to onboarding', async () => {
    await openConfirmation();
    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await fireEvent.press(screen.getByText('Delete account permanently'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding'));
    expect(client.functions.invoke).toHaveBeenCalledWith('delete-account', { body: {} });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(clearAllLocalData).toHaveBeenCalled();
  });

  it('deletes nothing while offline', async () => {
    networkState.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    await openConfirmation();
    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await fireEvent.press(screen.getByText('Delete account permanently'));

    expect(await screen.findByText(/You’re offline. Nothing was deleted/)).toBeOnTheScreen();
    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(clearAllLocalData).not.toHaveBeenCalled();
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it('keeps local data when the server fails', async () => {
    client.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { status: 500 } },
    });
    await openConfirmation();
    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await fireEvent.press(screen.getByText('Delete account permanently'));

    expect(await screen.findByText(/couldn’t be deleted/)).toBeOnTheScreen();
    expect(clearAllLocalData).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('finishes locally when a retry finds the account already deleted', async () => {
    client.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'unauthorized', context: { status: 401 } },
    });
    client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 403, code: 'user_not_found' },
    });
    await openConfirmation();
    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await fireEvent.press(screen.getByText('Delete account permanently'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding'));
    expect(clearAllLocalData).toHaveBeenCalled();
  });
});
