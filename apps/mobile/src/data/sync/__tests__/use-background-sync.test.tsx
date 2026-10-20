import type { Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSessionStore } from '@/features/auth/session-store';

import { supabase } from '../../supabase';
import { syncOnce } from '../sync';
import { useActivityRealtime } from '../use-activity-realtime';
import { useBackgroundSync } from '../use-background-sync';

jest.mock('../../supabase', () => {
  const channel = { on: jest.fn(), subscribe: jest.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return {
    supabase: {
      auth: { onAuthStateChange: jest.fn() },
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(async () => undefined),
    },
  };
});
jest.mock('../sync', () => ({ syncOnce: jest.fn(async () => ({ changed: false })) }));
jest.mock('../changes', () => ({ onLocalChange: jest.fn(() => () => undefined) }));
jest.mock('@/features/baseline/api', () => ({
  dropRevokedBaseline: jest.fn(async () => undefined),
}));
jest.mock('../../activities/process', () => ({
  processNewActivities: jest.fn(async () => []),
}));
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const session = (isAnonymous: boolean) =>
  useSessionStore.setState({
    session: { user: { id: 'user-1', is_anonymous: isAnonymous } } as unknown as Session,
    isAnonymous,
    ready: true,
  });

function renderSyncHooks() {
  return renderHook(
    () => {
      useBackgroundSync();
      useActivityRealtime();
    },
    { wrapper },
  );
}

beforeEach(() => jest.clearAllMocks());

describe('background sync', () => {
  it('does not run for an anonymous quiz user', async () => {
    session(true);
    const { unmount } = await renderSyncHooks();
    // Give a started sync the chance to reach syncOnce.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(syncOnce).not.toHaveBeenCalled();
    expect(supabase!.channel).not.toHaveBeenCalled();
    unmount();
  });

  it('syncs and subscribes to activities for a signed-in account', async () => {
    session(false);
    const { unmount } = await renderSyncHooks();
    await waitFor(() => expect(syncOnce).toHaveBeenCalledWith(supabase, 'user-1'));
    expect(supabase!.channel).toHaveBeenCalledWith('activities:user-1');
    unmount();
  });
});
