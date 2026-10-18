import { planConfig } from './config';
import type { SlotRole, UserProfile, WorkoutTemplate, WorkoutTerrain } from './types';

const cfg = planConfig.terrain;

/**
 * Minetti et al. (2002): energy cost of running on a gradient in J/kg/m (gradient as fraction,
 * valid for −0.45 … +0.45; values outside are clamped).
 */
export function minettiCost(gradient: number): number {
  const i = Math.min(0.45, Math.max(-0.45, gradient));
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

/**
 * Pace on a gradient relative to flat pace at the same effort (> 1 = slower).
 * Descents are capped: at most ~5 % faster than flat pace (protect legs, avoid overstriding).
 */
export function gradeAdjustedPaceFactor(gradient: number): number {
  return Math.max(minettiCost(gradient) / minettiCost(0), 1 - cfg.downhillMaxSpeedup);
}

export interface ElevationPoint {
  distanceM: number;
  elevationM: number;
}

export interface PaceSegment {
  startM: number;
  endM: number;
  gradient: number;
  targetSecPerKm: number;
  fastestSecPerKm: number;
  slowestSecPerKm: number;
  /** Pace is the primary target (tempo, intervals, races); otherwise HR leads and pace guides. */
  pacePrimary: boolean;
}

/** Linear interpolation of the elevation at a distance along the route. */
export function elevationAt(points: readonly ElevationPoint[], distanceM: number): number {
  const first = points[0];
  if (!first) return 0;
  let prev = first;
  for (const p of points) {
    if (p.distanceM >= distanceM) {
      if (p.distanceM === prev.distanceM) return p.elevationM;
      const t = (distanceM - prev.distanceM) / (p.distanceM - prev.distanceM);
      return prev.elevationM + t * (p.elevationM - prev.elevationM);
    }
    prev = p;
  }
  return prev.elevationM;
}

/** Splits a route into 1 km segments (250 m on steep kilometres) with their gradient. */
export function routeSegments(
  points: readonly ElevationPoint[],
): { startM: number; endM: number; gradient: number }[] {
  const total = points.at(-1)?.distanceM ?? 0;
  const segments: { startM: number; endM: number; gradient: number }[] = [];
  const grade = (a: number, b: number) =>
    (elevationAt(points, b) - elevationAt(points, a)) / (b - a);
  for (let start = 0; start < total; start += cfg.segmentM) {
    const end = Math.min(total, start + cfg.segmentM);
    if (Math.abs(grade(start, end)) < cfg.steepGradient) {
      segments.push({ startM: start, endM: end, gradient: grade(start, end) });
      continue;
    }
    for (let s = start; s < end; s += cfg.steepSegmentM) {
      const e = Math.min(end, s + cfg.steepSegmentM);
      segments.push({ startM: s, endM: e, gradient: grade(s, e) });
    }
  }
  return segments;
}

/**
 * Per-segment pace plan from the session's flat target pace (CLAUDE.md "Grade-adjusted pace").
 * Easy / Zone 2 sessions keep HR as primary target; tempo, intervals and races use pace.
 */
export function perKmPacePlan(
  points: readonly ElevationPoint[],
  flatPaceSecPerKm: number,
  pacePrimary: boolean,
): PaceSegment[] {
  return routeSegments(points).map((seg) => {
    const target = flatPaceSecPerKm * gradeAdjustedPaceFactor(seg.gradient);
    return {
      ...seg,
      targetSecPerKm: Math.round(target),
      fastestSecPerKm: Math.round(target * (1 - cfg.paceRange)),
      slowestSecPerKm: Math.round(target * (1 + cfg.paceRange)),
      pacePrimary,
    };
  });
}

/** Running duration of a route at a flat pace, grade-adjusted per segment. */
export function estimateRunDurationSec(
  points: readonly ElevationPoint[],
  flatPaceSecPerKm: number,
): number {
  return routeSegments(points).reduce(
    (sum, s) =>
      sum + ((s.endM - s.startM) / 1000) * flatPaceSecPerKm * gradeAdjustedPaceFactor(s.gradient),
    0,
  );
}

/** Cycling fallback model: flat speed plus ~10 min per 100 m of gain. */
export function estimateBikeDurationSec(
  distanceKm: number,
  gainM: number,
  flatSpeedKmh: number,
): number {
  return (distanceKm / flatSpeedKmh) * 3600 + (gainM / 100) * cfg.bikeMinPer100mGain * 60;
}

/**
 * How hilly a planned run/bike session should be and what that means for distance and load.
 * Long sessions use the home terrain; easy and quality sessions are kept on flatter routes so the
 * terrain does not turn them into hard days; flat-only templates (track intervals) stay flat.
 */
export function planSessionTerrain(
  template: WorkoutTemplate,
  role: SlotRole,
  durationMin: number,
  profile: UserProfile,
  easyPaceSecPerKm: number,
): WorkoutTerrain | null {
  const sport = template.sport;
  if (sport !== 'run' && sport !== 'bike') return null;
  const home = cfg.gainPerKm[sport][profile.terrain];
  let gainPerKm: number;
  if (template.terrain === 'flat') gainPerKm = cfg.gainPerKm[sport].flat;
  else if (role === 'long' || template.terrain === 'climb') gainPerKm = home;
  else gainPerKm = Math.min(home, cfg.easyGainCapPerKm[sport]);

  let distanceKm: number;
  if (sport === 'run') {
    const g = gainPerKm / 500; // gain is spread over the uphill half of each km
    const factor = (gradeAdjustedPaceFactor(g) + gradeAdjustedPaceFactor(-g)) / 2;
    distanceKm = (durationMin * 60) / (easyPaceSecPerKm * factor);
  } else {
    const speed = planConfig.paces.bikeFlatSpeedKmh[profile.experience];
    const hoursPerKm = 1 / speed + (gainPerKm / 100) * (cfg.bikeMinPer100mGain / 60);
    distanceKm = durationMin / 60 / hoursPerKm;
  }
  return {
    gainPerKm,
    distanceKm: Math.round(distanceKm * 10) / 10,
    expectedGainM: Math.round(distanceKm * gainPerKm),
    eccentric:
      sport === 'run' &&
      gainPerKm >= cfg.eccentric.minGainPerKm &&
      durationMin >= cfg.eccentric.minDurationMin,
  };
}
