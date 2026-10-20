/**
 * Strava route (planned in Strava's route builder) → row of `public.strava_routes` (pure, no Deno
 * APIs, so it can be checked with plain Node too, like `strava-map.ts`). Only rides and runs are
 * kept; the GPX is fetched separately (`/routes/{id}/export_gpx`) and added by the import.
 */

/** Largest GPX stored (the table checks the same limit). */
export const MAX_GPX_CHARS = 5 * 1024 * 1024;

/** Strava route `type`: 1 = ride, 2 = run. Other types are skipped. */
const SPORTS: Record<number, 'run' | 'bike'> = { 1: 'bike', 2: 'run' };

/** Fields of Strava's Route object that Peakr uses. */
export interface StravaRoute {
  /** Route ids exceed 2^53 – always use `id_str` when present. */
  id: number;
  id_str?: string;
  name?: string | null;
  type?: number;
  private?: boolean;
  distance?: number;
  elevation_gain?: number;
  updated_at?: string | null;
  /** Epoch seconds of the last change (older answers carry only this). */
  timestamp?: number | null;
}

export interface StravaRouteRow {
  user_id: string;
  external_id: string;
  name: string | null;
  sport: 'run' | 'bike';
  distance_m: number | null;
  elevation_gain_m: number | null;
  private: boolean;
  strava_updated_at: string | null;
  deleted: false;
}

const nonNegative = (n: number | undefined): number | null =>
  n !== undefined && Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;

function updatedAt(route: StravaRoute): string | null {
  const parsed = route.updated_at ? Date.parse(route.updated_at) : NaN;
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  if (typeof route.timestamp === 'number' && Number.isFinite(route.timestamp)) {
    return new Date(route.timestamp * 1000).toISOString();
  }
  return null;
}

export function mapStravaRoute(userId: string, route: StravaRoute): StravaRouteRow | null {
  const sport = route.type !== undefined ? SPORTS[route.type] : undefined;
  if (!sport) return null;
  const externalId = route.id_str || String(route.id);
  if (!externalId || externalId.length > 64) return null;
  const name = route.name?.trim();
  return {
    user_id: userId,
    external_id: externalId,
    name: name ? name.slice(0, 200) : null,
    sport,
    distance_m: nonNegative(route.distance),
    elevation_gain_m: nonNegative(route.elevation_gain),
    private: route.private === true,
    strava_updated_at: updatedAt(route),
    deleted: false,
  };
}

/** A stored route needs a new GPX export when it is new, was removed before, or changed at Strava. */
export function routeChanged(
  row: Pick<StravaRouteRow, 'strava_updated_at'>,
  stored: { strava_updated_at: string | null; deleted: boolean } | undefined,
): boolean {
  // Live rows always carry their GPX (a failed export stores nothing).
  if (!stored || stored.deleted) return true;
  if (!row.strava_updated_at || !stored.strava_updated_at) return true;
  return Date.parse(row.strava_updated_at) !== Date.parse(stored.strava_updated_at);
}
