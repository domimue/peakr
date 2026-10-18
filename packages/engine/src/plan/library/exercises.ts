import type { Result, ValidationIssue } from '../../result';
import type { LegLoad } from '../types';

/** Strength exercise starter library – WORKOUTS.md §8.6. Users can add custom exercises. */

export type ExercisePattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'calf'
  | 'pushHorizontal'
  | 'pushVertical'
  | 'pullHorizontal'
  | 'pullVertical'
  | 'arms'
  | 'core'
  | 'plyometrics'
  | 'mobility';

export type Equipment =
  'barbell' | 'dumbbell' | 'kettlebell' | 'machine' | 'cable' | 'band' | 'bodyweight' | 'box';

export interface Exercise {
  id: string;
  pattern: ExercisePattern;
  muscles: string[];
  equipment: Equipment[];
  legLoad: LegLoad;
  unilateral: boolean;
  /** i18n key for name and how-to: `exercises.<id>.name` / `.howTo`. */
  howToKey: string;
  videoUrl?: string;
}

/** An exercise the user added; shown by its own `name` instead of an i18n key. */
export interface CustomExercise extends Omit<Exercise, 'howToKey'> {
  /** Always `custom:<id>`. */
  id: string;
  name: string;
  howTo?: string;
}

export const CUSTOM_PREFIX = 'custom:';

export const EXERCISE_PATTERNS: readonly ExercisePattern[] = [
  'squat',
  'hinge',
  'lunge',
  'calf',
  'pushHorizontal',
  'pushVertical',
  'pullHorizontal',
  'pullVertical',
  'arms',
  'core',
  'plyometrics',
  'mobility',
];

export const EQUIPMENT: readonly Equipment[] = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine',
  'cable',
  'band',
  'bodyweight',
  'box',
];

/** Patterns that train the legs (lower-body progression steps, §8.5). */
export const LOWER_BODY_PATTERNS: readonly ExercisePattern[] = [
  'squat',
  'hinge',
  'lunge',
  'calf',
  'plyometrics',
];

type Row = [
  id: string,
  muscles: string[],
  equipment: Equipment[],
  legLoad: LegLoad,
  unilateral?: boolean,
];

const rows: Record<ExercisePattern, Row[]> = {
  squat: [
    ['back_squat', ['quads', 'glutes'], ['barbell'], 'heavy'],
    ['front_squat', ['quads', 'glutes', 'core'], ['barbell'], 'heavy'],
    ['goblet_squat', ['quads', 'glutes'], ['dumbbell', 'kettlebell'], 'light'],
    ['leg_press', ['quads', 'glutes'], ['machine'], 'heavy'],
    ['bodyweight_squat', ['quads', 'glutes'], ['bodyweight'], 'light'],
    ['split_squat', ['quads', 'glutes'], ['bodyweight', 'dumbbell'], 'light', true],
    ['bulgarian_split_squat', ['quads', 'glutes'], ['dumbbell', 'bodyweight'], 'heavy', true],
  ],
  hinge: [
    ['deadlift', ['hamstrings', 'glutes', 'back'], ['barbell'], 'heavy'],
    ['romanian_deadlift', ['hamstrings', 'glutes'], ['barbell', 'dumbbell'], 'heavy'],
    [
      'single_leg_rdl',
      ['hamstrings', 'glutes'],
      ['dumbbell', 'kettlebell', 'bodyweight'],
      'light',
      true,
    ],
    ['hip_thrust', ['glutes'], ['barbell', 'bodyweight'], 'heavy'],
    ['glute_bridge', ['glutes'], ['bodyweight'], 'light'],
    ['kettlebell_swing', ['glutes', 'hamstrings'], ['kettlebell'], 'light'],
    ['good_morning', ['hamstrings', 'back'], ['barbell'], 'heavy'],
  ],
  lunge: [
    ['walking_lunge', ['quads', 'glutes'], ['bodyweight', 'dumbbell'], 'heavy', true],
    ['reverse_lunge', ['quads', 'glutes'], ['bodyweight', 'dumbbell'], 'light', true],
    ['step_up', ['quads', 'glutes'], ['box', 'dumbbell'], 'light', true],
    ['lateral_lunge', ['adductors', 'glutes'], ['bodyweight'], 'light', true],
    ['pistol_squat_progression', ['quads', 'glutes'], ['bodyweight'], 'heavy', true],
  ],
  calf: [
    ['standing_calf_raise', ['calves'], ['bodyweight', 'machine'], 'light'],
    ['bent_knee_calf_raise', ['calves'], ['bodyweight', 'machine'], 'light'],
    ['tibialis_raise', ['shins'], ['bodyweight'], 'none'],
    ['single_leg_hops', ['calves'], ['bodyweight'], 'light', true],
  ],
  pushHorizontal: [
    ['bench_press', ['chest', 'triceps'], ['barbell'], 'none'],
    ['dumbbell_press', ['chest', 'triceps'], ['dumbbell'], 'none'],
    ['incline_press', ['chest', 'shoulders'], ['barbell', 'dumbbell'], 'none'],
    ['push_up', ['chest', 'triceps'], ['bodyweight'], 'none'],
    ['feet_elevated_push_up', ['chest', 'shoulders', 'triceps'], ['bodyweight'], 'none'],
    ['archer_push_up', ['chest', 'triceps'], ['bodyweight'], 'none', true],
    ['dips', ['chest', 'triceps'], ['bodyweight'], 'none'],
  ],
  pushVertical: [
    ['overhead_press', ['shoulders', 'triceps'], ['barbell'], 'none'],
    ['dumbbell_shoulder_press', ['shoulders', 'triceps'], ['dumbbell'], 'none'],
    ['pike_push_up', ['shoulders', 'triceps'], ['bodyweight'], 'none'],
    ['lateral_raise', ['shoulders'], ['dumbbell', 'cable'], 'none'],
  ],
  pullHorizontal: [
    ['barbell_row', ['back', 'biceps'], ['barbell'], 'none'],
    ['dumbbell_row', ['back', 'biceps'], ['dumbbell'], 'none', true],
    ['seated_cable_row', ['back', 'biceps'], ['cable'], 'none'],
    ['inverted_row', ['back', 'biceps'], ['bodyweight'], 'none'],
    ['face_pull', ['rear_delts', 'upper_back'], ['cable', 'band'], 'none'],
  ],
  pullVertical: [
    ['pull_up', ['lats', 'biceps'], ['bodyweight'], 'none'],
    ['chin_up', ['lats', 'biceps'], ['bodyweight'], 'none'],
    ['lat_pulldown', ['lats', 'biceps'], ['cable', 'machine'], 'none'],
    ['band_assisted_pull_up', ['lats', 'biceps'], ['band'], 'none'],
  ],
  arms: [
    ['biceps_curl', ['biceps'], ['dumbbell', 'barbell'], 'none'],
    ['hammer_curl', ['biceps', 'forearms'], ['dumbbell'], 'none'],
    ['triceps_pushdown', ['triceps'], ['cable'], 'none'],
    ['overhead_triceps_extension', ['triceps'], ['dumbbell', 'cable'], 'none'],
  ],
  core: [
    ['plank', ['core'], ['bodyweight'], 'none'],
    ['side_plank', ['core', 'obliques'], ['bodyweight'], 'none'],
    ['dead_bug', ['core'], ['bodyweight'], 'none'],
    ['bird_dog', ['core', 'back'], ['bodyweight'], 'none'],
    ['pallof_press', ['core', 'obliques'], ['cable', 'band'], 'none'],
    ['hanging_knee_raise', ['core', 'hip_flexors'], ['bodyweight'], 'none'],
    ['copenhagen_plank', ['adductors', 'core'], ['bodyweight'], 'none'],
    ['ab_wheel', ['core'], ['bodyweight'], 'none'],
  ],
  plyometrics: [
    ['pogo_hops', ['calves'], ['bodyweight'], 'heavy'],
    ['box_jump', ['quads', 'glutes'], ['box'], 'heavy'],
    ['broad_jump', ['quads', 'glutes'], ['bodyweight'], 'heavy'],
    ['bounding', ['glutes', 'calves'], ['bodyweight'], 'heavy', true],
    ['a_skips', ['hip_flexors', 'calves'], ['bodyweight'], 'light'],
  ],
  mobility: [
    ['hip_flexor_stretch', ['hip_flexors'], ['bodyweight'], 'none', true],
    ['ankle_dorsiflexion', ['calves', 'ankles'], ['bodyweight'], 'none', true],
    ['thoracic_rotation', ['upper_back'], ['bodyweight'], 'none'],
    ['hips_90_90', ['hips'], ['bodyweight'], 'none'],
    ['hamstring_floss', ['hamstrings'], ['bodyweight'], 'none', true],
  ],
};

export const exercises: readonly Exercise[] = (Object.keys(rows) as ExercisePattern[]).flatMap(
  (pattern) =>
    rows[pattern].map(([id, muscles, equipment, legLoad, unilateral = false]) => ({
      id,
      pattern,
      muscles,
      equipment,
      legLoad,
      unilateral,
      howToKey: `exercises.${id}`,
    })),
);

const byId = new Map(exercises.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined {
  return byId.get(id);
}

/** Library or custom exercise by id. */
export function resolveExercise(
  id: string,
  custom: readonly CustomExercise[] = [],
): Exercise | CustomExercise | undefined {
  return byId.get(id) ?? custom.find((c) => c.id === id);
}

/**
 * Bodyweight progression by harder variation (§8.5, e.g. push-up → feet elevated → archer).
 * Each chain runs easy → hard.
 */
export const progressionChains: readonly (readonly string[])[] = [
  ['push_up', 'feet_elevated_push_up', 'archer_push_up'],
  ['bodyweight_squat', 'split_squat', 'bulgarian_split_squat', 'pistol_squat_progression'],
  ['band_assisted_pull_up', 'pull_up'],
  ['glute_bridge', 'hip_thrust'],
  ['dead_bug', 'ab_wheel'],
];

/** The next harder bodyweight variation, if the exercise is part of a chain. */
export function nextVariation(id: string): string | undefined {
  for (const chain of progressionChains) {
    const i = chain.indexOf(id);
    if (i >= 0) return chain[i + 1];
  }
  return undefined;
}

/** Whether the equipment the user has (gym / home / hotel set) allows this exercise. */
export function hasEquipmentFor(
  exercise: Pick<Exercise, 'equipment'>,
  available: readonly Equipment[],
): boolean {
  return exercise.equipment.some((e) => available.includes(e));
}

export type CustomExerciseField = 'name' | 'equipment';

export interface CustomExerciseInput {
  id: string;
  name: string;
  pattern: ExercisePattern;
  equipment: Equipment[];
  legLoad: LegLoad;
  unilateral?: boolean;
  muscles?: string[];
  howTo?: string;
}

/** Validates a user-defined exercise; the id gets the `custom:` prefix. */
export function validateCustomExercise(
  input: CustomExerciseInput,
): Result<CustomExercise, CustomExerciseField> {
  const issues: ValidationIssue<CustomExerciseField>[] = [];
  const name = input.name.trim();
  if (name.length === 0) issues.push({ field: 'name', code: 'required' });
  else if (name.length > 60)
    issues.push({ field: 'name', code: 'outOfRange', params: { min: 1, max: 60 } });
  if (input.equipment.length === 0) issues.push({ field: 'equipment', code: 'required' });
  if (issues.length > 0) return { ok: false, issues };
  const howTo = input.howTo?.trim();
  return {
    ok: true,
    value: {
      id: input.id.startsWith(CUSTOM_PREFIX) ? input.id : `${CUSTOM_PREFIX}${input.id}`,
      name,
      pattern: input.pattern,
      muscles: input.muscles ?? [],
      equipment: [...new Set(input.equipment)],
      legLoad: input.legLoad,
      unilateral: input.unilateral ?? false,
      ...(howTo ? { howTo } : {}),
    },
  };
}
