import { zoneConfig } from './config';
import type { Result, ValidationIssue } from './result';
import { paceZonesFromBoundaries, type PaceZone } from './zones';

const cfg = zoneConfig.run;

export const RACE_DISTANCES_M = {
  '5k': 5000,
  '10k': 10000,
  half: 21097.5,
  marathon: 42195,
} as const;

export type RaceDistanceId = keyof typeof RACE_DISTANCES_M;

export const RACE_DISTANCE_IDS = Object.keys(RACE_DISTANCES_M) as RaceDistanceId[];

/** Race results accepted as input for pace zones (a marathon is too dependent on fuelling). */
export type ReferenceRaceId = Exclude<RaceDistanceId, 'marathon'>;

export const REFERENCE_RACE_IDS: readonly ReferenceRaceId[] = ['5k', '10k', 'half'];

export type RaceAnalysisField = 'timeSec';

export interface RaceAnalysisInput {
  distance: ReferenceRaceId;
  timeSec?: number;
}

export interface RacePrediction {
  distance: RaceDistanceId;
  /** Whole seconds. Always an estimate, except for the input distance itself. */
  timeSec: number;
  paceSecPerKm: number;
  isInput: boolean;
}

export interface RaceAnalysis {
  distance: ReferenceRaceId;
  timeSec: number;
  paceSecPerKm: number;
  /** Estimated pace you could hold for about one hour. */
  thresholdPaceSecPerKm: number;
  predictions: RacePrediction[];
  paceZones: PaceZone[];
}

/** Riegel formula: T2 = T1 × (D2 / D1)^exponent. Returns seconds (not rounded). */
export function predictRaceTime(
  fromDistanceM: number,
  fromTimeSec: number,
  toDistanceM: number,
  exponent: number = cfg.riegelExponent,
): number {
  for (const [name, value] of [
    ['fromDistanceM', fromDistanceM],
    ['fromTimeSec', fromTimeSec],
    ['toDistanceM', toDistanceM],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive number, got ${value}`);
    }
  }
  return fromTimeSec * (toDistanceM / fromDistanceM) ** exponent;
}

/** Fastest and slowest realistic finish time for a distance, in whole seconds. */
export function realisticRaceTimeRange(distance: RaceDistanceId): { min: number; max: number } {
  const km = RACE_DISTANCES_M[distance] / 1000;
  return {
    min: Math.round(cfg.paceLimitsSecPerKm.min * km),
    max: Math.round(cfg.paceLimitsSecPerKm.max * km),
  };
}

export function analyzeRaceResult(
  input: RaceAnalysisInput,
): Result<RaceAnalysis, RaceAnalysisField> {
  const issues: ValidationIssue<RaceAnalysisField>[] = [];
  const { distance, timeSec } = input;

  if (timeSec === undefined) {
    issues.push({ field: 'timeSec', code: 'required' });
    return { ok: false, issues };
  }
  const range = realisticRaceTimeRange(distance);
  if (!Number.isFinite(timeSec) || timeSec < range.min || timeSec > range.max) {
    issues.push({ field: 'timeSec', code: 'unrealisticRaceTime', params: range });
    return { ok: false, issues };
  }

  const distanceM = RACE_DISTANCES_M[distance];
  // Distance at which the Riegel-predicted time equals the threshold duration (~1 h race).
  const thresholdDistanceM =
    distanceM * (cfg.thresholdDurationSec / timeSec) ** (1 / cfg.riegelExponent);
  const thresholdPace = cfg.thresholdDurationSec / (thresholdDistanceM / 1000);

  const predictions = RACE_DISTANCE_IDS.map((id): RacePrediction => {
    const toM = RACE_DISTANCES_M[id];
    const predicted = id === distance ? timeSec : predictRaceTime(distanceM, timeSec, toM);
    return {
      distance: id,
      timeSec: Math.round(predicted),
      paceSecPerKm: Math.round(predicted / (toM / 1000)),
      isInput: id === distance,
    };
  });

  return {
    ok: true,
    value: {
      distance,
      timeSec,
      paceSecPerKm: Math.round(timeSec / (distanceM / 1000)),
      thresholdPaceSecPerKm: Math.round(thresholdPace),
      predictions,
      paceZones: paceZonesFromBoundaries(cfg.paceZoneBoundaries.map((f) => f * thresholdPace)),
    },
  };
}
