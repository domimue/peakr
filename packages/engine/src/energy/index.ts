export { energyConfig, type EnergyConfig } from './config';
export {
  ageOn,
  countedWorkoutKcal,
  daysBetween,
  energyToday,
  estimateWorkoutKcal,
  intakeFloorKcal,
  recentBodyFat,
  restingEnergy,
  validateBodyProfile,
  type BodyProfile,
  type BodyProfileField,
  type BodySex,
  type EnergyToday,
  type Measurement,
  type RestingEnergy,
  type WorkoutEnergy,
  type WorkoutEnergyInput,
} from './energy';
export { trendOn, trendWeightKg, weightTrend, type TrendPoint, type WeighIn } from './trend';
export {
  activeEnergyDay,
  completedWorkoutKcal,
  type ActiveEnergy,
  type ActiveEnergyInput,
  type CompletedWorkout,
  type PlannedWorkoutEnergy,
} from './active';
export { dayBalance, isLogged, weekBalance, type EnergyDay, type WeekBalance } from './balance';
export { adaptiveTdee, type AdaptiveResult, type TdeeEstimate } from './adaptive';
export {
  calculationVsScale,
  type Confidence,
  type ScaleComparison,
  type WeekComparison,
} from './scale';
export {
  bodyComposition,
  type BodyComposition,
  type CompositionPoint,
  type MassSplit,
} from './composition';
export { BODY_SOURCES, pickBySource, type BodySource } from './sources';
export {
  bmiOf,
  intakeTarget,
  maxLossRatePerWeekKg,
  nextTargetChange,
  proteinTargetG,
  rapidLossWarning,
  validateWeightGoal,
  type WeightGoalKind,
  type IntakeTarget,
  type TargetChange,
  type TargetReason,
  type WeightGoal,
  type WeightGoalField,
  type WeightGoalInput,
} from './safety';
export {
  energyDays,
  weighInsOf,
  type EnergyInputs,
  type ModelDay,
  type SourcedValue,
} from './days';
export {
  customRate,
  detectPlateau,
  energyBasis,
  everydayFactor,
  goalSnapshot,
  goalForecast,
  goalTargets,
  maxRateFor,
  proteinForGoal,
  ratePresets,
  reverseDiet,
  targetBreakdown,
  targetReached,
  trainingDeviation,
  trainingInteraction,
  weeklyCheckIn,
  weeklyPlan,
  weekLoadContext,
  type CheckInStatus,
  type EnergyBasis,
  type GoalSettings,
  type GoalSnapshot,
  type GoalForecast,
  type GoalTargets,
  type GoalTargetsInput,
  type PresetKey,
  type RatePreset,
  type TargetBreakdown,
} from './goal';
