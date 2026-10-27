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
  thresholdFromEasyPace,
} from './run';
export { calculateCss, type CssField, type CssInput, type CssResult } from './swim';
export { mad, median, quantile, theilSen, trimmedMean } from './stats';
export * from './baseline';
export * from './health';
export * from './energy';
export * from './nutrition';
export * from './body';
export { paceZonesFromBoundaries, ZONE_NUMBERS, type PaceZone, type ZoneNumber } from './zones';
export { planConfig, type PlanConfig } from './plan/config';
export { generatePlan, type PlanContinuation, type PlanField } from './plan/generate';
export { checkStartFloors, startFloors, type FloorBreach, type StartFloors } from './plan/floors';
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
  copyInputOf,
  CUSTOM_PREFIX,
  EQUIPMENT,
  EXERCISE_PATTERNS,
  exercises,
  getExercise,
  getTemplate,
  hasEquipmentFor,
  isCustomExercise,
  LOWER_BODY_PATTERNS,
  MUSCLE_GROUPS,
  nextVariation,
  progressionChains,
  resolveExercise,
  splits,
  TRACKING_MODES,
  validateCustomExercise,
  workoutLibrary,
  type CustomExercise,
  type CustomExerciseField,
  type CustomExerciseInput,
  type Equipment,
  type Exercise,
  type ExercisePattern,
  type MuscleGroup,
  type SplitDef,
  type TrackingMode,
} from './plan/library';
export * from './gym';
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
  sportExperience,
  startLevel,
  type SessionOutcome,
} from './plan/levels';
export {
  estimateBikeDurationSec,
  estimateRunDurationSec,
  gainPaceFactor,
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
export { annotateWeeks, weekKind } from './plan/week-facts';
export {
  indoorVersion,
  treadmillSpeedKmh,
  type IndoorKind,
  type IndoorVersion,
} from './plan/indoor';
export * from './weather';
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
export {
  absorbActivity,
  absorbGymSession,
  absorbImpact,
  type AbsorbChange,
  type AbsorbResult,
  type SessionImpact,
} from './plan/absorb';
export { isEccentricActivity } from './plan/activities';
export { setWorkoutRoute } from './plan/edit';
export { athleteFor, runPaceSecPerKm, type Athlete } from './plan/materialize';
export {
  boundingBox,
  cumulativeDistances,
  decodePolyline,
  encodePolyline,
  haversineM,
  normalizeTrack,
  resampleTrack,
  simplifyTrack,
  trackLengthM,
  type BBox,
  type LatLon,
} from './route/geo';
export { parseGpx, type GpxField, type GpxPoint, type GpxTrack } from './route/gpx';
export {
  buildRouteProfile,
  elevationStats,
  findClimbs,
  hasHillRepeatSegment,
  profileFromStreams,
  smoothProfile,
  type Climb,
  type ElevationStats,
  type RouteProfile,
} from './route/profile';
export {
  estimateBikeRouteDurationSec,
  estimateSessionOnRouteSec,
  mainSetFlatPace,
  routePacePlan,
  sessionFlatSpeedKmh,
  type RouteSport,
} from './route/pace-plan';
export {
  rankRoutes,
  scoreRoute,
  type MatchableRoute,
  type MatchReason,
  type RouteMatch,
} from './route/match';
export {
  recogniseRoutes,
  sameTrack,
  type RecognisedRoute,
  type TrackActivity,
} from './route/cluster';
export {
  evaluateActivity,
  type ActivityEvaluation,
  type ActivityStream,
  type EvaluationOptions,
  type EvaluationPlan,
  type KmEvaluation,
  type KmVerdict,
} from './route/evaluate';
export {
  classifyTerrain,
  learnTerrainProfile,
  type LearnedTerrain,
  type SportTerrain,
  type TerrainSample,
} from './route/terrain-profile';
export {
  desiredGainPerKm,
  matchableCandidate,
  pickRoundTrips,
  roundTripDistanceM,
  roundTripRequest,
  type PickedRoundTrip,
  type RoundTripCandidate,
  type RoundTripRequest,
  type RoutingProvider,
} from './route/routing';
export {
  buildZwo,
  zwiftSportOf,
  type ZwiftSport,
  type ZwoFile,
  type ZwoOptions,
  type ZwoResult,
} from './plan/zwift';
export type { ZwiftProvider, ZwiftPushResult, ZwiftScheduledWorkout } from './plan/zwift-provider';
