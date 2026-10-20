import type { Session } from '@supabase/supabase-js';
import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useSessionStore } from '@/features/auth/session-store';
import { renderWithQuery } from '@/test-utils/render-with-query';

import * as api from '../api';
import { useIntegrations, type IntegrationInfo } from '../queries';
import { ConnectionsScreen } from '../screens/connections-screen';

jest.mock('../queries', () => ({ useIntegrations: jest.fn() }));
jest.mock('@/data/repositories/route-repository');
jest.mock('../api', () => ({
  connect: jest.fn(),
  disconnect: jest.fn(() => Promise.resolve(true)),
  syncStravaNow: jest.fn(() => Promise.resolve({ ok: true, imported: 2 })),
}));
jest.mock('@/data/sync/use-background-sync', () => ({
  requestSync: jest.fn(() => Promise.resolve(false)),
}));

const integrations = (list: IntegrationInfo[]) =>
  jest.mocked(useIntegrations).mockReturnValue({
    data: list,
    isPending: false,
    refetch: jest.fn(() => Promise.resolve()),
  } as unknown as ReturnType<typeof useIntegrations>);

const signIn = () =>
  useSessionStore.setState({
    session: { user: { id: 'user-1', email: 'a@b.ch' } } as unknown as Session,
    ready: true,
  });

beforeEach(() => {
  useSessionStore.setState({ session: null, ready: true });
  integrations([]);
});

describe('Connections', () => {
  it('asks to sign in first', async () => {
    await renderWithQuery(<ConnectionsScreen />);
    expect(screen.getByText(/Sign in to connect Strava/)).toBeOnTheScreen();
  });

  it('offers to connect Strava and states how the data is used', async () => {
    signIn();
    await renderWithQuery(<ConnectionsScreen />);
    expect(screen.getByText('Not connected')).toBeOnTheScreen();
    // The official Strava button (an image) with its accessible name.
    expect(screen.getByRole('button', { name: 'Connect with Strava' })).toBeOnTheScreen();
    expect(
      screen.getByText(/never shown to anyone else and never used to train AI/),
    ).toBeOnTheScreen();
    expect(screen.getByText('Powered by Strava')).toBeOnTheScreen();
  });

  it('shows the last sync, syncs now and disconnects after a confirmation', async () => {
    signIn();
    integrations([
      {
        provider: 'strava',
        status: 'active',
        connectedAt: '2026-10-20T08:00:00Z',
        lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
    ]);
    await renderWithQuery(<ConnectionsScreen />);
    expect(screen.getByText('Connected')).toBeOnTheScreen();
    expect(screen.getByTestId('strava-last-synced')).toHaveTextContent('Last synced 5 minutes ago');

    await fireEvent.press(screen.getByText('Sync now'));
    expect(await screen.findByText('2 activities checked.')).toBeOnTheScreen();

    const alert = jest.spyOn(Alert, 'alert');
    await fireEvent.press(screen.getByText('Disconnect Strava'));
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
    expect(api.disconnect).toHaveBeenCalledWith('strava');
    expect(
      await screen.findByText('Strava is disconnected and its data deleted.'),
    ).toBeOnTheScreen();
  });

  it('shows the result of a connect flow that came back by deep link', async () => {
    signIn();
    await renderWithQuery(<ConnectionsScreen result="denied" />);
    expect(screen.getByText(/activity access is needed/)).toBeOnTheScreen();
  });
});
