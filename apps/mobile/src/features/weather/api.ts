import type { LatLon, WeatherForecast } from '@peakr/engine';

import { supabase } from '@/data/supabase';

/** Hourly forecast from the `weather` Edge Function (provider calls and caching are server-side). */
export async function fetchForecast(point: LatLon): Promise<WeatherForecast> {
  if (!supabase) throw new Error('offline');
  const { data, error } = await supabase.functions.invoke<WeatherForecast>('weather', {
    body: { lat: point.lat, lon: point.lon },
  });
  if (error || !data || !Array.isArray(data.hours)) throw new Error('weather');
  return data;
}
