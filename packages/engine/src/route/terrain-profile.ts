import { planConfig } from '../plan/config';
import { parseIsoDate } from '../plan/dates';
import type { ElevationPoint } from '../plan/terrain';
import type { Terrain } from '../plan/types';
import type { RouteSport } from './pace-plan';
import { findClimbs, type Climb } from './profile';

/**
 * The user's real home terrain, learned from recent outdoor runs and rides (CLAUDE.md "Terrain
 * profile": after Strava is connected, learn avg elevation gain per km and typical climbs).
 */

const cfg = planConfig.routes.profile;
const TERRAINS: readonly Terrain[] = ['flat', 'rolling', 'hilly', 'mountainous'];

export interface TerrainSample {
  sport: string;
  /** Local date `YYYY-MM-DD`. */
  date: string;
  indoor: boolean;
  distanceM: number | null;
  elevationGainM: number | null;
  /** Smoothed elevation profile, when the activity has streams (for typical climbs). */
  profile?: readonly ElevationPoint[] | null;
}

export interface SportTerrain {
  sport: RouteSport;
  activities: number;
  gainPerKm: number;
  terrain: Terrain;
}

export interface LearnedTerrain {
  /** Terrain of the main sport (run if learned, else bike). */
  terrain: Terrain;
  sports: SportTerrain[];
  /** Up to three typical climbs: the most gain first. */
  climbs: Climb[];
  /** Activities the profile is based on. */
  activities: number;
}

/** Terrain class whose typical gain per km (planConfig) is closest. */
export function classifyTerrain(sport: RouteSport, gainPerKm: number): Terrain {
  const typical = planConfig.terrain.gainPerKm[sport];
  let best: Terrain = 'flat';
  for (const t of TERRAINS) {
    if (Math.abs(typical[t] - gainPerKm) < Math.abs(typical[best] - gainPerKm)) best = t;
  }
  return best;
}

export function learnTerrainProfile(
  samples: readonly TerrainSample[],
  today: string,
): LearnedTerrain | null {
  const end = parseIsoDate(today) as number;
  const recent = samples.filter((s) => {
    const day = parseIsoDate(s.date);
    return (
      (s.sport === 'run' || s.sport === 'bike') &&
      !s.indoor &&
      (s.distanceM ?? 0) > 0 &&
      s.elevationGainM !== null &&
      day !== null &&
      day <= end &&
      day > end - cfg.windowDays
    );
  });
  if (recent.length < cfg.minActivities) return null;

  const sports: SportTerrain[] = [];
  for (const sport of ['run', 'bike'] as const) {
    const list = recent.filter((s) => s.sport === sport);
    if (list.length === 0) continue;
    const km = list.reduce((sum, s) => sum + (s.distanceM as number) / 1000, 0);
    const gain = list.reduce((sum, s) => sum + (s.elevationGainM as number), 0);
    const gainPerKm = Math.round((gain / km) * 10) / 10;
    sports.push({
      sport,
      activities: list.length,
      gainPerKm,
      terrain: classifyTerrain(sport, gainPerKm),
    });
  }
  const climbs = recent
    .flatMap((s) => (s.profile ? findClimbs(s.profile) : []))
    .sort((a, b) => b.gainM - a.gainM)
    .slice(0, 3);
  return {
    terrain: (sports[0] as SportTerrain).terrain,
    sports,
    climbs,
    activities: recent.length,
  };
}
