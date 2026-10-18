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
