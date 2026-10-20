/**
 * Weather check (CLAUDE.md "Real-life & seasonal adaptation" 4).
 *
 *   POST /weather  (Authorization: user JWT, also anonymous)  { lat, lon }
 *        → WeatherForecast (`_shared/weather.ts`): yesterday + 7 days, hourly, local times.
 *
 * The location is snapped to a ~5 km grid first; the forecast is cached per grid cell and UTC hour
 * in `weather_cache`, so a provider is called at most once per cell and hour. The location is not
 * stored with the user and never logged. MeteoSwiss data for Switzerland, Open-Meteo elsewhere.
 *
 * `verify_jwt = false` like the other functions; the JWT is checked here.
 */

import { adminClient, json, userFromRequest } from '../_shared/supabase.ts';
import { providerFor, snapToGrid, WeatherError, type WeatherForecast } from '../_shared/weather.ts';

const HOUR_MS = 3_600_000;
/** Cache rows older than this are removed on a miss. */
const KEEP_MS = 24 * HOUR_MS;

function parseLocation(body: unknown): { lat: number; lon: number } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { lat, lon } = body as { lat?: unknown; lon?: unknown };
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const admin = adminClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const location = parseLocation(await req.json().catch(() => null));
  if (!location) return json({ error: 'location' }, 400);
  const lat = snapToGrid(location.lat);
  const lon = snapToGrid(location.lon);
  const provider = providerFor(lat, lon);
  const cell = `${provider.id}:${lat.toFixed(2)}:${lon.toFixed(2)}`;
  const hour = new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS).toISOString();

  const { data: cached, error: readError } = await admin
    .from('weather_cache')
    .select('payload')
    .eq('cell', cell)
    .eq('hour', hour)
    .maybeSingle();
  if (readError) console.warn('Weather cache read failed', readError.message);
  if (cached) return json(cached.payload as WeatherForecast);

  let forecast: WeatherForecast;
  try {
    forecast = await provider.hourly(lat, lon);
  } catch (e) {
    const status = e instanceof WeatherError ? e.status : 'network';
    console.warn('Weather provider failed', provider.id, status);
    return json({ error: 'provider' }, 502);
  }

  const { error: writeError } = await admin
    .from('weather_cache')
    .upsert({ cell, hour, payload: forecast }, { onConflict: 'cell,hour' });
  if (writeError) console.warn('Weather cache write failed', writeError.message);
  await admin
    .from('weather_cache')
    .delete()
    .lt('hour', new Date(Date.now() - KEEP_MS).toISOString());
  return json(forecast);
});
