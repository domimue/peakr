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
export { planConfig, type PlanConfig } from './plan/config';
export { generatePlan, type PlanField } from './plan/generate';
export {
  exercises,
  getExercise,
  getTemplate,
  splits,
  workoutLibrary,
  type Equipment,
  type Exercise,
  type ExercisePattern,
  type SplitDef,
} from './plan/library';
export { isHardEndurance, isHardOnItsOwn } from './plan/classify';
export { hardShare, strengthLoad, stepLoad } from './plan/load';
export {
  deloadSets,
  levelAfterPause,
  nextLevel,
  progressStrength,
  resumeWeightKg,
  type SessionOutcome,
} from './plan/levels';
export {
  estimateBikeDurationSec,
  estimateRunDurationSec,
  gradeAdjustedPaceFactor,
  minettiCost,
  perKmPacePlan,
  type ElevationPoint,
  type PaceSegment,
} from './plan/terrain';
export type * from './plan/types';
export { SPORTS } from './plan/types';
