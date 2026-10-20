import {
  weatherHint,
  weatherMoveDays,
  type WeatherForecast,
  type WeatherHint,
  type Workout,
} from '@peakr/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

import { todayIso } from '@/data/ids';
import * as repo from '@/data/repositories/weather-repository';

import { usePlan } from '../plan/queries';
import { fetchForecast } from './api';
import { locationCell, weatherLocation } from './location';
import type { WeatherSettings } from './settings';

/** TanStack Query hooks of the weather check. */

export const weatherKeys = {
  settings: ['weather', 'settings'] as const,
  forecast: ['weather', 'forecast'] as const,
};

export function useWeatherSettings() {
  return useQuery({ queryKey: weatherKeys.settings, queryFn: repo.getWeatherSettings });
}

export function useSaveWeatherSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (settings: WeatherSettings) => {
      await repo.saveWeatherSettings(settings);
      if (!settings.enabled) await repo.clearCachedForecast();
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: weatherKeys.settings });
      await client.invalidateQueries({ queryKey: weatherKeys.forecast });
    },
  });
}

export type ForecastState =
  | { status: 'off' }
  | { status: 'noLocation' }
  | { status: 'ok'; forecast: WeatherForecast; source: 'current' | 'home'; stale: boolean };

/** Cached forecasts older than this are not shown when the refresh fails. */
const CACHE_MAX_AGE_MS = 12 * 3_600_000;

async function loadForecast(settings: WeatherSettings): Promise<ForecastState> {
  if (!settings.enabled) return { status: 'off' };
  const location = await weatherLocation(settings);
  if (!location) return { status: 'noLocation' };
  const cell = locationCell(location.point);
  try {
    const forecast = await fetchForecast(location.point);
    await repo.saveCachedForecast({ forecast, cell });
    return { status: 'ok', forecast, source: location.source, stale: false };
  } catch (error) {
    // Offline: the last forecast for the same place, while it is recent enough.
    const cached = await repo.getCachedForecast();
    const age = cached ? Date.now() - Date.parse(cached.forecast.fetchedAt) : Infinity;
    if (cached && cached.cell === cell && age < CACHE_MAX_AGE_MS) {
      return { status: 'ok', forecast: cached.forecast, source: location.source, stale: true };
    }
    throw error;
  }
}

/** The forecast for the weather location; refreshed every 30 minutes while the app is open. */
export function useForecast() {
  const { data: settings } = useWeatherSettings();
  return useQuery({
    queryKey: [...weatherKeys.forecast, settings] as const,
    queryFn: () => loadForecast(settings as WeatherSettings),
    enabled: settings !== undefined,
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 1,
  });
}

/** Hints the user waved away ("keep it outdoors") – for this app session only. */
interface DismissedState {
  ids: readonly string[];
  dismiss: (workoutId: string) => void;
}

export const useDismissedHints = create<DismissedState>()((set) => ({
  ids: [],
  dismiss: (id) => set((s) => ({ ids: [...s.ids, id] })),
}));

export interface WorkoutWeather {
  hint: WeatherHint;
  /** Days without broken rules and bad weather, nearest first (may be empty). */
  moveDays: string[];
}

/** The weather hint of one workout, or null (check off, fine weather, dismissed, …). */
export function useWorkoutWeather(w: Workout | undefined): WorkoutWeather | null {
  const { data: stored } = usePlan();
  const { data: settings } = useWeatherSettings();
  const { data: forecast } = useForecast();
  const dismissed = useDismissedHints((s) => s.ids);
  if (!w || !stored || !settings || forecast?.status !== 'ok' || dismissed.includes(w.id)) {
    return null;
  }
  const { state, input } = stored;
  const hint = weatherHint(forecast.forecast, state, w, input.profile, settings.sessionHour);
  if (!hint) return null;
  const moveDays = hint.actions.includes('move')
    ? weatherMoveDays(state, w.id, input, todayIso(), forecast.forecast, settings.sessionHour)
    : [];
  return { hint, moveDays };
}
