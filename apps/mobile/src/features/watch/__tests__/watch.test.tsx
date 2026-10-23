import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import * as watchRepo from '@/data/repositories/watch-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { createRemoteWatchProvider, type Invoke } from '../remote-provider';
import { optionState, parseWatchChoice } from '../options';
import { WatchOnboardingScreen } from '../screens/watch-onboarding-screen';
import { WatchPicker } from '../watch-picker';

jest.mock('@/data/repositories/watch-repository');
jest.mock('@/data/repositories/baseline-repository');
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router') }));
// The remote provider imports the integrations API, which needs the (unconfigured) Supabase client.
jest.mock('@/data/supabase', () => ({ supabase: null }));

// The in-memory mock (src/data/repositories/__mocks__).
const repo =
  watchRepo as unknown as typeof import('@/data/repositories/__mocks__/watch-repository');

let push: jest.SpyInstance;
beforeEach(() => {
  repo.resetStore();
  push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
});
// Only the router spy is restored: `restoreAllMocks` would also wipe the repository mock.
afterEach(() => push.mockRestore());

describe('watch options', () => {
  it('shows Apple Watch as iPhone-app-only on Android and ready on iOS', () => {
    expect(optionState('apple', 'android')).toBe('iosOnly');
    expect(optionState('apple', 'ios')).toBe('ready');
  });

  it('offers the file export while a platform is not approved yet, and file export always works', () => {
    expect(optionState('garmin', 'android')).toBe('fileForNow');
    expect(optionState('coros', 'ios')).toBe('fileForNow');
    expect(optionState('suunto', 'android')).toBe('fileForNow');
    expect(optionState('file', 'android')).toBe('ready');
    expect(optionState('none', 'android')).toBe('ready');
  });

  it('parses only known choices', () => {
    expect(parseWatchChoice('garmin')).toBe('garmin');
    expect(parseWatchChoice('polar')).toBeNull();
    expect(parseWatchChoice(3)).toBeNull();
  });
});

describe('watch picker', () => {
  it('lists every watch with its hint', async () => {
    const onChange = jest.fn();
    await renderWithQuery(<WatchPicker value={null} onChange={onChange} os="android" />);
    for (const label of [
      'Garmin',
      'COROS',
      'Suunto',
      'Apple Watch',
      'Other watch',
      "I don't use a watch",
    ]) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    expect(screen.getByText('Available with the iPhone app.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Garmin'));
    expect(onChange).toHaveBeenCalledWith('garmin');
  });
});

describe('watch onboarding step', () => {
  it('saves the pick and goes on to the forecast', async () => {
    await renderWithQuery(<WatchOnboardingScreen />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await fireEvent.press(screen.getByText('Other watch'));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(repo.saveWatchChoice).toHaveBeenCalledWith('file'));
    expect(repo.store.choice).toBe('file');
    expect(router.push).toHaveBeenCalledWith('/onboarding/forecast');
  });

  it('can be skipped without saving anything', async () => {
    await renderWithQuery(<WatchOnboardingScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));
    expect(router.push).toHaveBeenCalledWith('/onboarding/forecast');
    expect(repo.store.choice).toBeNull();
  });
});

describe('remote watch provider', () => {
  const workout = {
    id: 'w1',
    date: '2026-11-02',
    name: 'Run',
    sport: 'run' as const,
    steps: [],
  };

  it('pushes through the Edge Function with today and maps the outcome', async () => {
    const invoke = jest.fn<ReturnType<Invoke>, Parameters<Invoke>>(async () => ({
      ok: true,
      data: { ok: true, items: [{ id: 'w1', ok: true, externalId: 'g1' }] },
    }));
    const garmin = createRemoteWatchProvider('garmin', { invoke, today: () => '2026-11-02' });
    expect(await garmin.pushWorkouts([workout])).toEqual({
      ok: true,
      items: [{ id: 'w1', ok: true, externalId: 'g1' }],
    });
    expect(invoke).toHaveBeenCalledWith('watch/push', {
      provider: 'garmin',
      workouts: [workout],
      today: '2026-11-02',
    });
  });

  it('reports the platform’s failure and a network error', async () => {
    const refused = createRemoteWatchProvider('coros', {
      invoke: async () => ({ ok: true, data: { ok: false, failure: 'not_available' } }),
    });
    expect(await refused.pushWorkouts([workout])).toMatchObject({
      ok: false,
      failure: 'not_available',
    });
    const offline = createRemoteWatchProvider('suunto', { invoke: async () => ({ ok: false }) });
    expect(await offline.pushWorkouts([workout])).toEqual({ ok: false, failure: 'network' });
    expect(await offline.pushRoute({ id: 'r', name: 'R', sport: 'run', points: [] })).toEqual({
      ok: false,
      failure: 'network',
    });
    expect(await offline.importActivities(new Date())).toEqual({ ok: false, failure: 'network' });
  });

  it('imports through the server and declares what each platform can do', async () => {
    const coros = createRemoteWatchProvider('coros', {
      invoke: async () => ({ ok: true, data: { ok: true, imported: 3 } }),
    });
    expect(await coros.importActivities(new Date('2026-10-01'))).toEqual({
      ok: true,
      rows: [],
      deleted: [],
    });
    expect(coros.capabilities.routes).toBe(false);
    expect(createRemoteWatchProvider('garmin').capabilities.routes).toBe(true);
    expect(createRemoteWatchProvider('garmin').capabilities.strength).toBe(false);
  });
});
