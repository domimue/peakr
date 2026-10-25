/**
 * Generated round trips (CLAUDE.md "Terrain intelligence" §2b, Phase 8b).
 *
 *   POST /round-trips  (Authorization: user JWT)
 *        { lat, lon, sport: 'run' | 'bike', targetDistanceM, count, gainPerKm }
 *        → RoundTripResponse (`_shared/routing/model.ts`): candidates with heights per point.
 *
 * The start is snapped to ~100 m and the distance to 500 m steps; results are cached per user and
 * snapped query in `route_cache` (14 days), so opening the same session again costs no provider
 * call. Picking the best candidates happens in the app with the engine's route matching score – it
 * needs the planned session. Only subscribers (entitlement `training`) generate routes, and each
 * user has a daily limit of cache misses to protect the provider quota. ORS_API_KEY stays here.
 *
 * `verify_jwt = false` like the other functions; the JWT is checked here. ROUTING_SKIP_ENTITLEMENT=1
 * turns the entitlement check off (development projects only).
 */

import { generateRoundTrips, RoutingError } from '../_shared/routing/provider.ts';
import {
  cacheKey,
  parseRoundTripQuery,
  routingConfig,
  snapQuery,
  type RoundTripResponse,
} from '../_shared/routing/model.ts';
import { adminClient, json, userFromRequest } from '../_shared/supabase.ts';

const DAY_MS = 86_400_000;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const admin = adminClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const parsed = parseRoundTripQuery(await req.json().catch(() => null));
  if (!parsed) return json({ error: 'query' }, 400);
  const query = snapQuery(parsed);
  const key = cacheKey(query);

  if (Deno.env.get('ROUTING_SKIP_ENTITLEMENT') !== '1') {
    const { data: entitled, error } = await admin.rpc('has_entitlement', {
      uid: user.id,
      name: 'training',
    });
    if (error) return json({ error: 'entitlement' }, 500);
    if (entitled !== true) return json({ error: 'subscription' }, 403);
  }

  const since = new Date(Date.now() - routingConfig.cacheDays * DAY_MS).toISOString();
  const { data: cached, error: readError } = await admin
    .from('route_cache')
    .select('payload')
    .eq('user_id', user.id)
    .eq('key', key)
    .gte('created_at', since)
    .maybeSingle();
  if (readError) console.warn('Route cache read failed', readError.message);
  if (cached) return json(cached.payload as RoundTripResponse);

  const { count, error: countError } = await admin
    .from('route_cache')
    .select('key', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - DAY_MS).toISOString());
  if (countError) console.warn('Route cache count failed', countError.message);
  if ((count ?? 0) >= routingConfig.dailyLimit) return json({ error: 'limit' }, 429);

  let result: RoundTripResponse;
  try {
    result = await generateRoundTrips(query);
  } catch (e) {
    const status = e instanceof RoutingError ? e.status : 'unknown';
    console.warn('Routing provider failed', status);
    return json({ error: status === 'config' ? 'config' : 'provider' }, 502);
  }

  // Empty results are not cached: the next try may succeed (e.g. after a provider hiccup).
  if (result.candidates.length > 0) {
    const { error: writeError } = await admin
      .from('route_cache')
      .upsert(
        { user_id: user.id, key, payload: result, created_at: new Date().toISOString() },
        { onConflict: 'user_id,key' },
      );
    if (writeError) console.warn('Route cache write failed', writeError.message);
  }
  await admin.from('route_cache').delete().eq('user_id', user.id).lt('created_at', since);
  return json(result);
});
