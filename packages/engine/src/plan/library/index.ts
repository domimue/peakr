import type { WorkoutTemplate } from '../types';
import { bikeTemplates } from './bike';
import { benchmarkTemplates, multisportTemplates, winterTemplates } from './multisport';
import { runTemplates } from './run';
import { strengthTemplates } from './strength';
import { swimTemplates } from './swim';

export {
  CUSTOM_PREFIX,
  EQUIPMENT,
  EXERCISE_PATTERNS,
  exercises,
  getExercise,
  hasEquipmentFor,
  LOWER_BODY_PATTERNS,
  nextVariation,
  progressionChains,
  resolveExercise,
  validateCustomExercise,
  type CustomExercise,
  type CustomExerciseField,
  type CustomExerciseInput,
  type Equipment,
  type Exercise,
  type ExercisePattern,
} from './exercises';
export { raceSimulationLevel } from './multisport';
export { splits, type SplitDef } from './strength';

/** The complete workout library (WORKOUTS.md). Workouts only ever come from these templates. */
export const workoutLibrary: readonly WorkoutTemplate[] = [
  ...runTemplates,
  ...bikeTemplates,
  ...swimTemplates,
  ...multisportTemplates,
  ...winterTemplates,
  ...benchmarkTemplates,
  ...strengthTemplates,
];

const byId = new Map(workoutLibrary.map((t) => [t.id, t]));

/** Looks up a template; an unknown id is an engine bug, never user input. */
export function getTemplate(id: string): WorkoutTemplate {
  const template = byId.get(id);
  if (!template) throw new Error(`unknown workout template: ${id}`);
  return template;
}
