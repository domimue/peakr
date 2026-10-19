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
export { generatePlan, type PlanContinuation, type PlanField } from './plan/generate';
export {
  activePause,
  activeTravel,
  activeWorkouts,
  allWorkouts,
  easeWorkout,
  findViolations,
  findWorkout,
  hasManualChanges,
  inDetailWindow,
  isPaused,
  moveWorkout,
  newPlanState,
  pausePlan,
  planRange,
  regeneratePlan,
  regenerationStart,
  resumePlan,
  resetWeek,
  resumeRules,
  setTravel,
  setWeekOverride,
  setWorkoutStatus,
  statusOf,
  weekOverrideOf,
  type AdjustResult,
  type EditCode,
  type EditField,
  type EditIssue,
  type EditResult,
  type MoveNoticeCode,
  type RebalanceSuggestion,
  type MoveResult,
  type MoveWarning,
  type PauseReason,
  type PlanInput,
  type PlanPause,
  type PlanState,
  type RuleCode,
  type RuleViolation,
  type WorkoutStatus,
} from './plan/edit';
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
export { COMMUTE_SPORTS, SPORTS } from './plan/types';
export { commuteMinutes, commutesValid } from './plan/commute';
export { travelOn } from './plan/travel';
export { winterVariantFor } from './plan/winter';
export {
  kindKey,
  WORKOUT_KINDS,
  workoutKind,
  type KindCategory,
  type KindSport,
  type WorkoutKind,
} from './plan/kinds';
export {
  summarizeWorkouts,
  workoutDistances,
  type SportDistances,
  type WeekSummary,
} from './plan/distance';
export {
  describeWorkout,
  durationRange,
  kindWorkoutType,
  normalizePlan,
  paceLimitSecPerKm,
  paceMode,
  typeColorKey,
  WORKOUT_TYPES,
  workoutType,
} from './plan/workout-type';
export { indoorVersion, type IndoorKind, type IndoorVersion } from './plan/indoor';
export {
  historyByMonth,
  performance,
  weekProgress,
  weekTags,
  workoutKm,
  type HistoryEntry,
  type HistoryMonth,
  type Performance,
  type PerformanceWeek,
  type PersonalBests,
  type ProgressSegment,
  type Totals,
  type WeekProgress,
  type WeekTag,
} from './plan/summary';
export {
  ACTIVITY_SOURCES,
  activityKey,
  activityKeys,
  activityLoad,
  activityZone,
  dedupeActivities,
  IMPORTED_SPORTS,
  isHardActivity,
  isSameActivity,
  matchActivities,
  type Activity,
  type ActivityLink,
  type ActivitySource,
  type ImportedSport,
  type MatchResult,
  type SourceActivity,
  type SourceRef,
} from './plan/activities';
export { absorbActivity, type AbsorbChange, type AbsorbResult } from './plan/absorb';
