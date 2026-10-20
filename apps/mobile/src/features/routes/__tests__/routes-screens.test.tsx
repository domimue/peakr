import { allWorkouts, encodePolyline, generatePlan, type GpxPoint } from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';

import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as activityRepo from '@/data/repositories/activity-repository';
import * as planRepo from '@/data/repositories/plan-repository';
import * as routeRepo from '@/data/repositories/route-repository';
import { useSessionStore } from '@/features/auth/session-store';
import { WorkoutScreen } from '@/features/plan/screens/workout-screen';
import { ProgressScreen } from '@/features/progress/progress-screen';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { redirectSystemPath } from '../../../../app/+native-intent';
import { KomootCard } from '../../integrations/screens/komoot-card';
import { normalizeKomootProfileUrl } from '../../integrations/komoot';
import { stravaRouteDraft, stravaRouteId } from '@/data/routes/build';

import {
  classifySharedText,
  gpxSport,
  isKomootGpx,
  nameFromUri,
  pointsFromActivity,
  routeFromPoints,
} from '../import';
import { RouteImportScreen } from '../screens/route-import-screen';
import { RouteLibraryScreen } from '../screens/route-library-screen';
import { RoutePickerScreen } from '../screens/route-picker-screen';
import { RouteRecogniseScreen } from '../screens/route-recognise-screen';
import { TerrainProfileScreen } from '../screens/terrain-profile-screen';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/activity-repository');
jest.mock('@/data/repositories/route-repository');
jest.mock('@/features/integrations/api', () => ({
  importStravaHistory: jest.fn(() => Promise.resolve({ ok: true, imported: 3 })),
  fetchStravaStreams: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('@/data/sync/use-background-sync', () => ({
  requestSync: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: jest.fn(() => ({})),
}));

const plans = planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');
const activities =
  activityRepo as unknown as typeof import('@/data/repositories/__mocks__/activity-repository');
const routes =
  routeRepo as unknown as typeof import('@/data/repositories/__mocks__/route-repository');

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

function storePlan() {
  const r = generatePlan(input.profile, input.goal, input.availability, '2026-10-19', '2027-02-14');
  if (!r.ok) throw new Error('plan');
  plans.store.plan = {
    id: 'plan-1',
    input,
    state: { plan: r.value, status: {}, pauses: [], revision: 0 },
  };
  return r.value;
}

/** First easy run of the plan (pace is a limit). */
const easyRunId = () =>
  allWorkouts(plans.store.plan?.state.plan ?? ({ weeks: [] } as never)).find(
    (w) => w.sport === 'run' && w.paceMode === 'limit',
  )?.id as string;

const M_PER_DEG = 111_195;
/** Out-and-back loop north of Zurich, `half` m each way, gentle hill. */
function loop(half: number, lonShift = 0): GpxPoint[] {
  const pts: GpxPoint[] = [];
  for (let d = 0; d <= half; d += 50)
    pts.push({ lat: 47.37 + d / M_PER_DEG, lon: 8.54 + lonShift, ele: 410 + d * 0.01 });
  for (let d = half; d >= 0; d -= 50)
    pts.push({ lat: 47.37 + d / M_PER_DEG, lon: 8.5401 + lonShift, ele: 410 + d * 0.01 });
  return pts;
}

function gpxOf(points: readonly GpxPoint[], name = 'Hausrunde'): string {
  const body = points
    .map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele></trkpt>`)
    .join('');
  return `<gpx><trk><name>${name}</name><type>running</type><trkseg>${body}</trkseg></trk></gpx>`;
}

function addRoute(id: string, half: number, source: 'gpx' | 'strava' = 'gpx', name = id) {
  const draft = routeFromPoints(loop(half), name, 'run', source);
  routes.store.routes.push({ ...draft, id, createdAt: routes.store.routes.length, updatedAt: 0 });
}

beforeEach(() => {
  plans.resetStore();
  activities.resetStore();
  routes.resetStore();
  jest.spyOn(ids, 'todayIso').mockReturnValue('2026-10-26');
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'replace').mockImplementation(() => undefined);
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  useSessionStore.setState({ session: null, ready: true });
});

afterEach(() => jest.restoreAllMocks());

describe('helpers', () => {
  it('guesses the sport and name of a GPX file', () => {
    expect(gpxSport('<type>cycling</type>')).toBe('bike');
    expect(gpxSport('<type>Running</type>')).toBe('run');
    expect(gpxSport('<gpx/>')).toBe('run');
    expect(nameFromUri('file:///cache/Morning%20loop.GPX')).toBe('Morning loop');
  });

  it('recognises Komoot GPX files and shared Komoot links', () => {
    expect(
      isKomootGpx('<?xml version="1.0"?><gpx version="1.1" creator="https://www.komoot.de">'),
    ).toBe(true);
    expect(isKomootGpx('<gpx creator="Garmin Connect">')).toBe(false);
    expect(classifySharedText('Check out this tour https://www.komoot.com/tour/123?ref=x')).toEqual(
      {
        kind: 'komootLink',
      },
    );
    expect(classifySharedText('  <gpx><trk/></gpx>')).toEqual({
      kind: 'gpx',
      xml: '<gpx><trk/></gpx>',
    });
    expect(classifySharedText('hello')).toEqual({ kind: 'other' });
  });

  it('turns a route planned in Strava into a library route with a stable id', () => {
    const draft = stravaRouteDraft('987', 'Uetliberg', 'bike', gpxOf(loop(3000)));
    expect(draft).toMatchObject({ name: 'Uetliberg', sport: 'bike', source: 'strava_route' });
    expect(draft?.sourceKeys).toEqual(['strava-route:987']);
    expect(stravaRouteId('987')).toBe('strava-route-987');
    expect(stravaRouteDraft('1', 'x', 'run', '<gpx></gpx>')).toBeNull();
  });

  it('sends opened GPX files to the import and leaves other links alone', () => {
    expect(redirectSystemPath({ path: 'content://x/route.gpx', initial: true })).toBe(
      '/routes/import?uri=content%3A%2F%2Fx%2Froute.gpx',
    );
    expect(redirectSystemPath({ path: '/integrations/strava', initial: false })).toBe(
      '/integrations/strava',
    );
  });

  it('validates Komoot profile links', () => {
    expect(normalizeKomootProfileUrl('https://www.komoot.com/de-de/user/12345')).toBe(
      'https://www.komoot.com/user/12345',
    );
    expect(normalizeKomootProfileUrl('komoot.de/user/abc/')).toBe(
      'https://www.komoot.com/user/abc',
    );
    expect(normalizeKomootProfileUrl('https://example.com/user/1')).toBeNull();
  });

  it('takes elevation from the stream when its track matches', () => {
    const track = loop(500);
    const latlng = encodePolyline(track);
    const stream = {
      source: 'strava' as const,
      externalId: '1',
      latlng,
      data: {
        distanceM: [],
        timeS: [],
        altitudeM: track.map((p) => p.ele as number),
        heartrate: null,
      },
    };
    expect(pointsFromActivity('x', stream)[0]?.ele).toBe(410);
    expect(pointsFromActivity(latlng, null)[0]?.ele).toBeNull();
  });
});

describe('route library', () => {
  it('shows the empty state with both ways to add routes', async () => {
    await renderWithQuery(<RouteLibraryScreen />);
    expect(await screen.findByText('No routes yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Import GPX file'));
    expect(router.push).toHaveBeenCalledWith('/routes/import');
    await fireEvent.press(screen.getByText('Find my routes on Strava'));
    expect(router.push).toHaveBeenCalledWith('/routes/recognise');
  });

  it('lists routes and filters them', async () => {
    addRoute('short', 2000, 'gpx', 'Short loop');
    addRoute('long', 9000, 'strava', 'Long loop');
    await renderWithQuery(<RouteLibraryScreen />);
    expect(await screen.findByText('Short loop')).toBeOnTheScreen();
    expect(screen.getByText('Long loop')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Recognised'));
    expect(screen.queryByText('Short loop')).toBeNull();
    await fireEvent.press(screen.getByText('Planned in Strava'));
    expect(screen.getByText('No route matches these filters.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Recognised'));
    await fireEvent.press(screen.getByText('Ride'));
    expect(screen.getByText('No route matches these filters.')).toBeOnTheScreen();
  });
});

describe('GPX import', () => {
  it('previews a shared file and saves it to the library', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ uri: 'file:///cache/Hausrunde.gpx' });
    (File as unknown as jest.Mock).mockImplementation(() => ({
      text: () => Promise.resolve(gpxOf(loop(2500))),
    }));
    await renderWithQuery(<RouteImportScreen />);
    expect(await screen.findByTestId('import-preview')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Hausrunde')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Add to my routes'));
    await waitFor(() => expect(routes.store.routes).toHaveLength(1));
    expect(routes.store.routes[0]).toMatchObject({
      name: 'Hausrunde',
      sport: 'run',
      source: 'gpx',
    });
    expect(routes.store.routes[0]?.distanceM).toBeGreaterThan(4900);
    expect(router.replace).toHaveBeenCalled();
  });

  it('keeps name, distance and elevation of a GPX shared from Komoot', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ uri: 'content://com.komoot/files/42' });
    (File as unknown as jest.Mock).mockImplementation(() => ({
      text: () =>
        Promise.resolve(
          gpxOf(loop(2500), 'Rigi Panoramaweg').replace(
            '<gpx>',
            '<gpx creator="https://www.komoot.de">',
          ),
        ),
    }));
    await renderWithQuery(<RouteImportScreen />);
    expect(await screen.findByDisplayValue('Rigi Panoramaweg')).toBeOnTheScreen();
    expect(screen.getByTestId('import-summary')).toHaveTextContent(
      /^5 km · \d+ m up · \d+ m down · From Komoot \(GPX\)$/,
    );
    await fireEvent.press(screen.getByText('Add to my routes'));
    await waitFor(() => expect(routes.store.routes[0]?.source).toBe('komoot'));
  });

  it('explains a shared Komoot link instead of reading it', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      text: 'https://www.komoot.com/tour/123456',
    });
    await renderWithQuery(<RouteImportScreen />);
    expect(await screen.findByTestId('import-error')).toHaveTextContent(/Export as GPX file/);
  });

  it('explains files without a track', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ uri: 'file:///cache/empty.gpx' });
    (File as unknown as jest.Mock).mockImplementation(() => ({
      text: () => Promise.resolve('<gpx></gpx>'),
    }));
    await renderWithQuery(<RouteImportScreen />);
    expect(await screen.findByTestId('import-error')).toHaveTextContent(
      'The file contains no track or route.',
    );
  });
});

describe('choosing a route for a workout', () => {
  it('offers matching routes and the free session; the choice shows on the workout', async () => {
    storePlan();
    addRoute('home', 4000, 'gpx', 'Home loop');
    addRoute('club', 4000, 'strava', 'Club loop');
    const id = easyRunId();
    await renderWithQuery(<RoutePickerScreen workoutId={id} />);
    expect(await screen.findByText('Home loop')).toBeOnTheScreen();
    expect(screen.getByText('Club loop')).toBeOnTheScreen();
    expect(screen.getByTestId('choose-free')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('choose-home'));
    await waitFor(() =>
      expect(
        allWorkouts(plans.store.plan?.state.plan as never).find((w) => w.id === id)?.routeId,
      ).toBe('home'),
    );
    expect(router.back).toHaveBeenCalled();
  });

  it('shows map, profile, expected time and the pace limit per km on the workout', async () => {
    storePlan();
    addRoute('home', 4000, 'gpx', 'Home loop');
    const id = easyRunId();
    const plan = plans.store.plan;
    if (!plan) throw new Error('plan');
    plan.state = {
      ...plan.state,
      plan: {
        ...plan.state.plan,
        weeks: plan.state.plan.weeks.map((wk) => ({
          ...wk,
          workouts: wk.workouts.map((w) => (w.id === id ? { ...w, routeId: 'home' } : w)),
        })),
      },
    };
    await renderWithQuery(<WorkoutScreen id={id} />);
    expect(await screen.findByTestId('workout-route')).toBeOnTheScreen();
    expect(screen.getByTestId('pace-table')).toBeOnTheScreen();
    expect(screen.getAllByText(/^no faster than \d+:\d\d \/km$/).length).toBeGreaterThan(0);
    expect(screen.getByText('Expected time')).toBeOnTheScreen();
  });

  it('evaluates a synced activity with streams per km', async () => {
    storePlan();
    const id = easyRunId();
    const date = id.slice(0, 10);
    const n = 201;
    activities.store.activities = [
      {
        source: 'strava',
        externalId: '7',
        sport: 'run',
        startTime: `${date}T06:00:00Z`,
        date,
        durationSec: 1500,
        distanceM: 5000,
        elevationGainM: 20,
        avgHr: 130,
        maxHr: 150,
        swimPaceSecPer100m: null,
        polyline: encodePolyline(loop(2500)),
        name: null,
        indoor: false,
        commute: false,
        summary: false,
        rpe: null,
        importedAt: 0,
        handled: true,
      },
    ];
    activities.store.links = [{ activityKey: 'strava:7', workoutId: id, planId: 'plan-1' }];
    routes.store.streams = [
      {
        source: 'strava',
        externalId: '7',
        latlng: null,
        data: {
          distanceM: Array.from({ length: n }, (_, i) => i * 25),
          timeS: Array.from({ length: n }, (_, i) => i * 7.5),
          altitudeM: Array.from(
            { length: n },
            (_, i) => 400 + (i < 100 ? i * 0.5 : 50 - (i - 100) * 0.5),
          ),
          heartrate: Array.from({ length: n }, () => 130),
        },
      },
    ];
    await renderWithQuery(<WorkoutScreen id={id} />);
    expect(await screen.findByTestId('workout-evaluation')).toBeOnTheScreen();
    expect(screen.getByText('Grade-adjusted evaluation')).toBeOnTheScreen();
    expect(screen.getByTestId('evaluation-table')).toBeOnTheScreen();
    expect(screen.getByText(/% of the time in the target zone$/)).toBeOnTheScreen();
  });
});

describe('routes from Strava', () => {
  const run = (id: string, day: number, half = 2000) => ({
    source: 'strava' as const,
    externalId: id,
    sport: 'run' as const,
    startTime: `2026-10-${String(day).padStart(2, '0')}T06:00:00Z`,
    date: `2026-10-${String(day).padStart(2, '0')}`,
    durationSec: 1500,
    distanceM: half * 2,
    elevationGainM: 20,
    avgHr: null,
    maxHr: null,
    swimPaceSecPer100m: null,
    polyline: encodePolyline(loop(half)),
    name: null,
    indoor: false,
    commute: false,
    summary: false,
    rpe: null,
    importedAt: 0,
    handled: true,
  });

  it('suggests routes done at least twice and adds them to the library', async () => {
    activities.store.activities = [run('1', 10), run('2', 12), run('3', 14, 900)];
    await renderWithQuery(<RouteRecogniseScreen />);
    expect(await screen.findByText('Run · 4 km · 2 times')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Add, Run · 4 km · 2 times'));
    await waitFor(() => expect(routes.store.routes).toHaveLength(1));
    expect(routes.store.routes[0]).toMatchObject({
      source: 'strava',
      sourceKeys: ['strava:2', 'strava:1'],
    });
    expect(await screen.findByText(/^Added without an elevation profile/)).toBeOnTheScreen();
    expect(screen.queryByText('Run · 4 km · 2 times')).toBeNull();
  });

  it('asks to sign in before searching Strava', async () => {
    await renderWithQuery(<RouteRecogniseScreen />);
    expect(await screen.findByText('No recurring routes found yet')).toBeOnTheScreen();
    expect(screen.getByText('Sign in and connect Strava to find your routes.')).toBeOnTheScreen();
  });

  it('learns the terrain profile and lets the user adopt it', async () => {
    storePlan();
    activities.store.activities = [
      { ...run('1', 10), elevationGainM: 100 },
      { ...run('2', 12), elevationGainM: 90 },
      { ...run('3', 14), elevationGainM: 80 },
    ];
    await renderWithQuery(<TerrainProfileScreen />);
    expect(await screen.findByText('Your recent activities: Hilly')).toBeOnTheScreen();
    expect(screen.getByText('Your answer in the quiz: Flat')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Use “Hilly” for my plan'));
    await waitFor(() => expect(plans.store.plan?.input.profile.terrain).toBe('hilly'));
  });

  it('shows how to get a terrain profile without activities', async () => {
    storePlan();
    await renderWithQuery(<TerrainProfileScreen />);
    expect(await screen.findByText('Not enough activities yet')).toBeOnTheScreen();
  });
});

describe('Komoot and progress', () => {
  it('stores a valid Komoot profile link only', async () => {
    await renderWithQuery(<KomootCard />);
    const field = await screen.findByLabelText('Komoot profile link');
    await fireEvent.changeText(field, 'https://example.com');
    await fireEvent.press(screen.getByText('Save'));
    expect(
      screen.getByText('That is not a Komoot profile link (komoot.com/user/…).'),
    ).toBeOnTheScreen();
    await fireEvent.changeText(field, 'https://www.komoot.com/de-de/user/42');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(routes.store.komoot).toBe('https://www.komoot.com/user/42'));
  });

  it('draws a route thumbnail for synced outdoor activities in the history', async () => {
    storePlan();
    const id = easyRunId();
    const plan = plans.store.plan;
    if (!plan) throw new Error('plan');
    plan.state = { ...plan.state, status: { [id]: 'done' } };
    activities.store.activities = [
      {
        ...{
          source: 'strava' as const,
          externalId: '9',
          sport: 'run' as const,
          startTime: `${id.slice(0, 10)}T06:00:00Z`,
          date: id.slice(0, 10),
          durationSec: 1500,
          distanceM: 5000,
          elevationGainM: 10,
          avgHr: null,
          maxHr: null,
          swimPaceSecPer100m: null,
          name: null,
          indoor: false,
          commute: false,
          summary: false,
          rpe: null,
          importedAt: 0,
          handled: true,
        },
        polyline: encodePolyline(loop(2500)),
      },
    ];
    activities.store.links = [{ activityKey: 'strava:9', workoutId: id, planId: 'plan-1' }];
    await renderWithQuery(<ProgressScreen />);
    expect(await screen.findByTestId(`history-route-${id}`)).toBeOnTheScreen();
  });
});
