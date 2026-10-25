import {
  allWorkouts,
  generatePlan,
  roundTripRequest,
  type GpxPoint,
  type RoundTripCandidate,
  type Workout,
} from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';

import { isEnabled } from '@/config/feature-flags';
import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as planRepo from '@/data/repositories/plan-repository';
import * as routeRepo from '@/data/repositories/route-repository';
import { supabase } from '@/data/supabase';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { RouteLibraryScreen } from '../screens/route-library-screen';
import { RoutePickerScreen } from '../screens/route-picker-screen';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/route-repository');
jest.mock('@/data/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('@/config/feature-flags', () => ({ isEnabled: jest.fn(() => true) }));

const plans = planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');
const routes =
  routeRepo as unknown as typeof import('@/data/repositories/__mocks__/route-repository');
const invoke = (supabase as unknown as { functions: { invoke: jest.Mock } }).functions.invoke;

const input: StoredPlanInput = {
  profile: {
    age: 35,
    experience: 'intermediate',
    sports: ['run'],
    terrain: 'flat',
    strength: { mode: 'none' },
  },
  goal: { kind: 'half' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  targetDate: '2027-02-14',
  hrZones: { age: 35, restingHr: 55 },
};

const HOME = { lat: 47.37, lon: 8.54 };
const M_PER_DEG = 111_195;

/** The plan's first easy run. */
function storeEasyRun(): Workout {
  const r = generatePlan(input.profile, input.goal, input.availability, '2026-10-19', '2027-02-14');
  if (!r.ok) throw new Error('plan');
  plans.store.plan = {
    id: 'plan-1',
    input,
    state: { plan: r.value, status: {}, pauses: [], revision: 0 },
  };
  return allWorkouts(r.value).find((w) => w.sport === 'run' && w.paceMode === 'limit') as Workout;
}

/** Out-and-back loop of `lengthM` from home, `east` metres sideways (different candidates). */
function candidate(id: string, lengthM: number, east: number): RoundTripCandidate {
  const half = lengthM / 2;
  const lon = (m: number) => HOME.lon + m / (M_PER_DEG * Math.cos((HOME.lat * Math.PI) / 180));
  const points: GpxPoint[] = [];
  for (let d = 0; d <= half; d += 50)
    points.push({ lat: HOME.lat + d / M_PER_DEG, lon: lon(east), ele: 410 });
  for (let d = half; d >= 0; d -= 50)
    points.push({ lat: HOME.lat + d / M_PER_DEG, lon: lon(east + 10), ele: 410 });
  points.push({ ...HOME, ele: 410 });
  return { id, points, distanceM: lengthM, surfaceSuitability: 1 };
}

function respond(w: Workout) {
  const target = roundTripRequest(w, input.profile, HOME)?.targetDistanceM ?? 10_000;
  invoke.mockResolvedValue({
    data: {
      provider: 'openrouteservice',
      elevation: 'swisstopo',
      candidates: [candidate('ors-0', target, 0), candidate('ors-1', target, 600)],
    },
    error: null,
  });
}

beforeEach(() => {
  plans.resetStore();
  routes.resetStore();
  invoke.mockReset();
  (isEnabled as jest.Mock).mockReturnValue(true);
  jest.spyOn(ids, 'todayIso').mockReturnValue('2026-10-26');
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('generated round trips in the route picker', () => {
  it('generates round trips from home, saves one and uses one for the session', async () => {
    const w = storeEasyRun();
    routes.store.homeStart = HOME;
    respond(w);
    await renderWithQuery(<RoutePickerScreen workoutId={w.id} />);

    expect(await screen.findByTestId('generated-ors-0')).toBeOnTheScreen();
    expect(screen.getByTestId('generated-ors-1')).toBeOnTheScreen();
    expect(screen.getByText(/Heights: swisstopo/)).toBeOnTheScreen();
    expect(invoke).toHaveBeenCalledWith('round-trips', {
      body: expect.objectContaining({ lat: HOME.lat, lon: HOME.lon, sport: 'run', count: 5 }),
    });

    await fireEvent.press(screen.getByTestId('generated-save-ors-1'));
    await waitFor(() => expect(routes.store.routes).toHaveLength(1));
    expect(routes.store.routes[0]).toMatchObject({ source: 'generated', sport: 'run' });
    expect(await screen.findByText('In your library')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('generated-ors-0'));
    await waitFor(() => expect(routes.store.routes).toHaveLength(2));
    const saved = routes.store.routes.find((r) => r.name.startsWith('Round trip 1'));
    await waitFor(() =>
      expect(
        allWorkouts(plans.store.plan?.state.plan as never).find((x) => x.id === w.id)?.routeId,
      ).toBe(saved?.id),
    );
    expect(router.back).toHaveBeenCalled();
    // Generated once per session and start; the server caches across app starts.
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('uses the current location when no home start point is set', async () => {
    const w = storeEasyRun();
    respond(w);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: true,
    });
    await renderWithQuery(<RoutePickerScreen workoutId={w.id} />);
    expect(
      await screen.findByText(/from your home start point or from where you are/),
    ).toBeOnTheScreen();
    expect(invoke).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('generated-locate'));
    expect(await screen.findByTestId('generated-ors-0')).toBeOnTheScreen();
    expect(invoke).toHaveBeenCalledWith('round-trips', {
      body: expect.objectContaining({ lat: 47.3769, lon: 8.5417 }),
    });
  });

  it('explains a denied location permission', async () => {
    const w = storeEasyRun();
    await renderWithQuery(<RoutePickerScreen workoutId={w.id} />);
    await fireEvent.press(await screen.findByTestId('generated-locate'));
    expect(await screen.findByText(/^Location permission was not granted/)).toBeOnTheScreen();
  });

  it('explains the daily limit, being offline and nothing fitting; retries on request', async () => {
    const w = storeEasyRun();
    routes.store.homeStart = HOME;
    invoke.mockResolvedValueOnce({ data: null, error: { context: { status: 429 } } });
    await renderWithQuery(<RoutePickerScreen workoutId={w.id} />);
    expect(await screen.findByText(/generated many round trips today/)).toBeOnTheScreen();

    invoke.mockResolvedValueOnce({ data: null, error: new Error('network') });
    await fireEvent.press(screen.getByTestId('generated-retry'));
    expect(await screen.findByText(/You are offline/)).toBeOnTheScreen();

    invoke.mockResolvedValueOnce({
      data: { provider: 'openrouteservice', elevation: 'ors', candidates: [] },
      error: null,
    });
    await fireEvent.press(screen.getByTestId('generated-retry'));
    expect(await screen.findByText(/No generated round trip fits/)).toBeOnTheScreen();
    expect(screen.getByText(/Heights: global terrain model/)).toBeOnTheScreen();
  });

  it('points to the subscription without a retry', async () => {
    const w = storeEasyRun();
    routes.store.homeStart = HOME;
    invoke.mockResolvedValueOnce({ data: null, error: { context: { status: 403 } } });
    await renderWithQuery(<RoutePickerScreen workoutId={w.id} />);
    expect(await screen.findByText(/part of the Training subscription/)).toBeOnTheScreen();
    expect(screen.queryByTestId('generated-retry')).toBeNull();
  });

  it('stays hidden while the feature is switched off', async () => {
    (isEnabled as jest.Mock).mockReturnValue(false);
    const w = storeEasyRun();
    routes.store.homeStart = HOME;
    await renderWithQuery(<RoutePickerScreen workoutId={w.id} />);
    expect(await screen.findByTestId('choose-free')).toBeOnTheScreen();
    expect(screen.queryByText('Generated round trips')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('filters saved round trips in the library', async () => {
    const w = storeEasyRun();
    routes.store.homeStart = HOME;
    respond(w);
    await renderWithQuery(<RoutePickerScreen workoutId={w.id} />);
    await fireEvent.press(await screen.findByTestId('generated-save-ors-0'));
    await waitFor(() => expect(routes.store.routes).toHaveLength(1));
    screen.unmount();
    await renderWithQuery(<RouteLibraryScreen />);
    await fireEvent.press(await screen.findByText('Generated'));
    expect(await screen.findByText(/^Round trip 1/)).toBeOnTheScreen();
  });
});
