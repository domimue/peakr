import {
  findWorkout,
  generatePlan,
  newPlanState,
  type Plan,
  type WeatherForecast,
  type WeatherHour,
  type Workout,
} from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import i18n from '@/i18n';

import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as planRepo from '@/data/repositories/plan-repository';
import * as weatherRepo from '@/data/repositories/weather-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { WorkoutScreen } from '../../plan/screens/workout-screen';
import { usePlanUiStore } from '../../plan/plan-ui-store';
import { TodayScreen } from '../../today/today-screen';
import { fetchForecast } from '../api';
import { WeatherChip } from '../components/weather-chip';
import { reminderDays } from '../../notifications/reminder-days';
import { useDismissedHints } from '../queries';
import { DEFAULT_WEATHER_SETTINGS, type WeatherSettings } from '../settings';
import { WeatherScreen } from '../weather-screen';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/activity-repository');
jest.mock('@/data/repositories/route-repository');
jest.mock('../api', () => ({ fetchForecast: jest.fn() }));

const planMock =
  planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');
const weatherMock =
  weatherRepo as unknown as typeof import('@/data/repositories/__mocks__/weather-repository');
const fetchMock = fetchForecast as jest.Mock;
const location = Location as jest.Mocked<typeof Location>;

/** Same plan as the plan screen tests; Monday 2026-10-26 has an easy run. */
const input: StoredPlanInput = {
  profile: {
    age: 35,
    experience: 'intermediate',
    sports: ['run'],
    terrain: 'flat',
    strength: { mode: 'peakr', equipment: 'gym' },
  },
  goal: { kind: 'half' },
  availability: { minutesPerDay: [60, 60, 45, 60, 60, 120, 90], doublesAllowed: false },
  targetDate: '2027-02-14',
  hrZones: { age: 35, restingHr: 55 },
};
const MONDAY = '2026-10-26';
const EASY = `${MONDAY}-1`;

function storePlan(): Plan {
  // Generated with Friday off, edited with Friday free: Friday is a clean "move" day.
  const r = generatePlan(
    input.profile,
    input.goal,
    { ...input.availability, minutesPerDay: [60, 60, 45, 60, 0, 120, 90] },
    '2026-10-19',
    '2027-02-14',
  );
  if (!r.ok) throw new Error('plan');
  planMock.store.plan = { id: 'plan-1', input, state: newPlanState(r.value) };
  return r.value;
}

function forecast(overrides: Record<string, Partial<WeatherHour>> = {}): WeatherForecast {
  const days = ['2026-10-25', MONDAY, '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];
  return {
    provider: 'meteoswiss',
    timezone: 'Europe/Zurich',
    fetchedAt: new Date().toISOString(),
    hours: days.flatMap((date) =>
      Array.from({ length: 24 }, (_, h) => {
        const time = `${date}T${String(h).padStart(2, '0')}:00`;
        return {
          time,
          temperatureC: 7,
          precipitationMm: 0,
          snowfallCm: 0,
          windGustKmh: 10,
          weatherCode: 2,
          ...overrides[time],
        };
      }),
    ),
  };
}

const RAIN_AT_18 = { [`${MONDAY}T18:00`]: { precipitationMm: 6, weatherCode: 65 } };
const enabled: WeatherSettings = { ...DEFAULT_WEATHER_SETTINGS, enabled: true, source: 'home' };

beforeEach(() => {
  planMock.resetStore();
  weatherMock.resetStore();
  weatherMock.store.home = { lat: 47.37, lon: 8.54 };
  fetchMock.mockReset();
  useDismissedHints.setState({ ids: [] });
  usePlanUiStore.setState({ view: 'weeks', weekStart: null, feedback: null });
  jest.spyOn(ids, 'todayIso').mockReturnValue(MONDAY);
  jest.spyOn(router, 'push').mockImplementation(() => undefined);
  jest.spyOn(router, 'back').mockImplementation(() => undefined);
});

describe('Today weather chip', () => {
  it('says the check is off and opens the settings', async () => {
    storePlan();
    await renderWithQuery(<TodayScreen />);
    await fireEvent.press(await screen.findByText('Weather check off'));
    expect(router.push).toHaveBeenCalledWith('/training/weather');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows temperature at the session time, for the home start point', async () => {
    storePlan();
    weatherMock.store.settings = enabled;
    fetchMock.mockResolvedValue(forecast());
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByText('6:00 PM · 7°')).toBeOnTheScreen();
    expect(fetchMock).toHaveBeenCalledWith({ lat: 47.37, lon: 8.54 });
    expect(screen.getByLabelText('Weather at 6:00 PM: partly cloudy, 7 degrees')).toBeOnTheScreen();
  });

  it('uses the current location only with permission, else the home start point', async () => {
    storePlan();
    weatherMock.store.settings = { ...enabled, source: 'current' };
    location.getForegroundPermissionsAsync.mockResolvedValueOnce({ granted: true } as never);
    location.getLastKnownPositionAsync.mockResolvedValueOnce({
      coords: { latitude: 46.2, longitude: 6.15 },
    } as never);
    fetchMock.mockResolvedValue(forecast());
    await renderWithQuery(<TodayScreen />);
    await screen.findByText('6:00 PM · 7°');
    expect(fetchMock).toHaveBeenCalledWith({ lat: 46.2, lon: 6.15 });
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks for a location when there is neither permission nor a home start point', async () => {
    storePlan();
    weatherMock.store.settings = { ...enabled, source: 'current' };
    weatherMock.store.home = null;
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByText('Set a location for the weather')).toBeOnTheScreen();
  });

  it('falls back to the last forecast of the same place when offline', async () => {
    storePlan();
    weatherMock.store.settings = enabled;
    weatherMock.store.cached = { forecast: forecast(), cell: '47.35:8.55' };
    fetchMock.mockRejectedValue(new Error('offline'));
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByText('6:00 PM · 7°')).toBeOnTheScreen();
  });
});

describe('weather hint on the day’s workout', () => {
  it('offers the treadmill and dry days; nothing changes on its own', async () => {
    const plan = storePlan();
    weatherMock.store.settings = enabled;
    fetchMock.mockResolvedValue(forecast(RAIN_AT_18));
    await renderWithQuery(<TodayScreen />);
    expect(await screen.findByText('Heavy rain expected from 6:00 PM')).toBeOnTheScreen();
    expect(planMock.savePlanState).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Switch to Treadmill – same load'));
    expect(router.push).toHaveBeenCalledWith(
      `/training/workout/${encodeURIComponent(EASY)}?setting=indoor`,
    );

    // Friday is free in the availability: moving there breaks no rule.
    await fireEvent.press(screen.getByText('Fri, Oct 30'));
    await waitFor(() => expect(planMock.savePlanState).toHaveBeenCalled());
    const saved = planMock.store.plan?.state.plan as Plan;
    expect(findWorkout(saved, EASY)?.date).toBe('2026-10-30');
    expect(findWorkout(plan, EASY)?.date).toBe(MONDAY);
    expect(router.push).toHaveBeenLastCalledWith('/plan');
  });

  it('“keep it outdoors” hides the hint', async () => {
    storePlan();
    weatherMock.store.settings = enabled;
    fetchMock.mockResolvedValue(forecast(RAIN_AT_18));
    await renderWithQuery(<TodayScreen />);
    await fireEvent.press(await screen.findByText('Keep it outdoors'));
    await waitFor(() => expect(screen.queryByTestId(`weather-hint-${EASY}`)).toBeNull());
  });

  it('no hint when the rain falls outside the usual training time', async () => {
    storePlan();
    weatherMock.store.settings = { ...enabled, sessionHour: 7 };
    fetchMock.mockResolvedValue(forecast(RAIN_AT_18));
    await renderWithQuery(<TodayScreen />);
    await screen.findByText('7:00 AM · 7°');
    expect(screen.queryByText('Heavy rain expected from 6:00 PM')).toBeNull();
  });
});

describe('workout detail', () => {
  it('pre-selects indoor when a hint is active, with the treadmill adaptations', async () => {
    storePlan();
    weatherMock.store.settings = enabled;
    fetchMock.mockResolvedValue(forecast(RAIN_AT_18));
    await renderWithQuery(<WorkoutScreen id={EASY} />);
    expect(await screen.findByText(/Treadmill at 1 % incline/)).toBeOnTheScreen();
    expect(screen.getByText(/Indoors your heart rate runs higher/)).toBeOnTheScreen();
    // Already indoors: the card does not offer the switch again.
    expect(screen.queryByText('Switch to Treadmill – same load')).toBeNull();
    // The user can still go outside.
    await fireEvent.press(screen.getByText('Outdoor'));
    expect(screen.queryByText(/Treadmill at 1 % incline/)).toBeNull();
  });

  it('stays outdoors without a hint', async () => {
    storePlan();
    weatherMock.store.settings = enabled;
    fetchMock.mockResolvedValue(forecast());
    // The chip shares the forecast query: once it shows the temperature, the forecast is there.
    await renderWithQuery(
      <>
        <WeatherChip date={MONDAY} />
        <WorkoutScreen id={EASY} />
      </>,
    );
    await screen.findByText('6:00 PM · 7°');
    expect(screen.getByTestId('indoor-toggle')).toBeOnTheScreen();
    expect(screen.queryByText(/Treadmill at 1 % incline/)).toBeNull();
  });
});

describe('weather settings', () => {
  it('turning it on asks for location; denied → home start point', async () => {
    await renderWithQuery(<WeatherScreen />);
    await fireEvent.press(await screen.findByText('On'));
    expect(
      await screen.findByText(/No location access – the weather check uses your home start point/),
    ).toBeOnTheScreen();
    await waitFor(() =>
      expect(weatherMock.store.settings).toMatchObject({ enabled: true, source: 'home' }),
    );
    expect(location.requestForegroundPermissionsAsync).toHaveBeenCalled();
  });

  it('turning it off removes the stored forecast', async () => {
    weatherMock.store.settings = enabled;
    weatherMock.store.cached = { forecast: forecast(), cell: '47.35:8.55' };
    await renderWithQuery(<WeatherScreen />);
    await fireEvent.press((await screen.findAllByText('Off'))[0] as never);
    await waitFor(() => expect(weatherMock.store.cached).toBeNull());
    expect(weatherMock.store.settings.enabled).toBe(false);
  });
});

describe('weather in the daily reminder', () => {
  const plan = (() => {
    const r = generatePlan(
      input.profile,
      input.goal,
      input.availability,
      '2026-10-19',
      '2027-02-14',
    );
    if (!r.ok) throw new Error('plan');
    return r.value;
  })();
  const state = newPlanState(plan);
  const t = i18n.t.bind(i18n);

  it('names the workout and merges the weather line into the same reminder', () => {
    const days = reminderDays(t, 'en', state, input.profile, forecast(RAIN_AT_18), enabled, MONDAY);
    const easy = findWorkout(plan, EASY) as Workout;
    const monday = days.find((d) => d.date === MONDAY);
    expect(monday).toMatchObject({ workoutId: easy.id, body: 'Tap for the steps and targets.' });
    expect(monday?.title).toMatch(/^Today: .+, Zone 2$/);
    expect(monday?.weather).toBe('Heavy rain from 6:00 PM – Treadmill option available.');
    // One entry per day, never a second one for the weather.
    expect(new Set(days.map((d) => d.date)).size).toBe(days.length);
  });

  it('no weather line in fine weather, with the check off, or without a forecast', () => {
    const args = [t, 'en', state, input.profile] as const;
    const monday = (d: ReturnType<typeof reminderDays>) => d.find((x) => x.date === MONDAY);
    expect(monday(reminderDays(...args, forecast(), enabled, MONDAY))?.weather).toBeNull();
    expect(
      monday(reminderDays(...args, forecast(RAIN_AT_18), DEFAULT_WEATHER_SETTINGS, MONDAY))
        ?.weather,
    ).toBeNull();
    expect(monday(reminderDays(...args, null, enabled, MONDAY))?.weather).toBeNull();
  });
});
