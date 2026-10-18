export { zoneConfig } from './config';
export { formatDuration } from './format';
export {
  calculateHrZones,
  defaultHrMethod,
  estimateHrMax,
  HR_ZONE_METHODS,
  type HrZone,
  type HrZoneField,
  type HrZoneInput,
  type HrZoneMethod,
  type HrZoneResult,
} from './hr';
export type { Range, Result, ValidationCode, ValidationIssue } from './result';
export {
  analyzeRaceResult,
  predictRaceTime,
  RACE_DISTANCE_IDS,
  RACE_DISTANCES_M,
  realisticRaceTimeRange,
  REFERENCE_RACE_IDS,
  type RaceAnalysis,
  type RaceAnalysisField,
  type RaceAnalysisInput,
  type RaceDistanceId,
  type RacePrediction,
  type ReferenceRaceId,
} from './run';
export { calculateCss, type CssField, type CssInput, type CssResult } from './swim';
export { paceZonesFromBoundaries, ZONE_NUMBERS, type PaceZone, type ZoneNumber } from './zones';
