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
  CUSTOM_PREFIX,
  EQUIPMENT,
  EXERCISE_PATTERNS,
  exercises,
  getExercise,
  getTemplate,
  hasEquipmentFor,
  LOWER_BODY_PATTERNS,
  nextVariation,
  progressionChains,
  resolveExercise,
  splits,
  validateCustomExercise,
  workoutLibrary,
  type CustomExercise,
  type CustomExerciseField,
  type CustomExerciseInput,
  type Equipment,
  type Exercise,
  type ExercisePattern,
  type SplitDef,
} from './plan/library';
export { adaptToEquipment, equipmentFor, type AdaptedSession } from './plan/strength-equipment';
export {
  prefillExercise,
  summarizeStrengthLog,
  type ExercisePrefill,
  type PlannedSet,
  type PrefillOptions,
  type SetLog,
  type StrengthLog,
  type StrengthLogSummary,
} from './plan/strength-log';
export { planStrengthWeek, routineSession, type StrengthSlot } from './plan/strength-plan';
export { defaultRestSec, parseReps, type RepRange } from './plan/strength-reps';
export { isHardEndurance, isHardOnItsOwn } from './plan/classify';
export { requiredSports } from './plan/composition';
export { isRaceGoal } from './plan/periodisation';
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
