import type { LegLoad, Phase, SplitId, StrengthSessionDef, WorkoutTemplate } from '../types';
import { ALL_PHASES, rpe } from './helpers';

/** Strength session templates – WORKOUTS.md §8.2 and §8.4. */

type Ex = [exerciseId: string, sets: number, reps: string];

function session(
  id: string,
  legLoad: LegLoad,
  whyKey: string,
  def: { rpe: number; durationMin: number; exercises: Ex[] },
  phases: Phase[] = ALL_PHASES,
): WorkoutTemplate {
  const strength: StrengthSessionDef = {
    rpe: def.rpe,
    durationMin: def.durationMin,
    exercises: def.exercises.map(([exerciseId, sets, reps]) => ({ exerciseId, sets, reps })),
  };
  return {
    id: `strength.${id}`,
    sport: 'strength',
    type: id,
    // Heavy-leg sessions count as hard for spacing (§8.3), everything else as easy.
    intensity: legLoad === 'heavy' ? 'hard' : 'easy',
    phases,
    levels: [],
    legLoad,
    whyKey,
    strength,
    // Strength has no zones; a single RPE step keeps the structure exportable.
    durationScaled: {
      minMin: def.durationMin,
      maxMin: def.durationMin,
      fill: { zone: 2, target: rpe(def.rpe) },
    },
  };
}

const core: Ex[] = [
  ['plank', 3, '30–45 s'],
  ['dead_bug', 3, '8–10'],
  ['side_plank', 2, '30 s'],
];
const mobility: Ex[] = [
  ['hip_flexor_stretch', 2, '45 s'],
  ['ankle_dorsiflexion', 2, '10'],
  ['thoracic_rotation', 2, '8'],
  ['hips_90_90', 2, '6'],
  ['hamstring_floss', 2, '10'],
];

export const strengthTemplates: WorkoutTemplate[] = [
  // Peakr programme (§8.4) – gym and home variants per phase.
  session('peakr_base_gym', 'heavy', 'why.strength.peakrBase', {
    rpe: 7.5,
    durationMin: 50,
    exercises: [
      ['back_squat', 3, '8–12'],
      ['romanian_deadlift', 3, '8–12'],
      ['dumbbell_press', 3, '8–12'],
      ['seated_cable_row', 3, '8–12'],
      ['standing_calf_raise', 3, '12'],
      ['plank', 3, '45 s'],
    ],
  }),
  session('peakr_base_home', 'light', 'why.strength.peakrBase', {
    rpe: 7.5,
    durationMin: 40,
    exercises: [
      ['goblet_squat', 3, '8–12'],
      ['single_leg_rdl', 3, '8–12'],
      ['push_up', 3, '8–12'],
      ['dumbbell_row', 3, '8–12'],
      ['glute_bridge', 3, '12'],
      ['side_plank', 3, '30 s'],
    ],
  }),
  session('peakr_build_gym', 'heavy', 'why.strength.peakrBuild', {
    rpe: 8,
    durationMin: 50,
    exercises: [
      ['back_squat', 4, '4–6'],
      ['deadlift', 3, '4–6'],
      ['box_jump', 3, '6'],
      ['pogo_hops', 3, '10'],
      ['overhead_press', 3, '6'],
      ['pull_up', 3, '6'],
    ],
  }),
  session('peakr_build_home', 'heavy', 'why.strength.peakrBuild', {
    rpe: 8,
    durationMin: 40,
    exercises: [
      ['bulgarian_split_squat', 4, '6'],
      ['single_leg_rdl', 3, '6'],
      ['broad_jump', 3, '6'],
      ['pogo_hops', 3, '10'],
      ['push_up', 3, '10'],
      ['inverted_row', 3, '8'],
    ],
  }),
  session('peakr_peak_gym', 'heavy', 'why.strength.peakrPeak', {
    rpe: 7,
    durationMin: 35,
    exercises: [
      ['back_squat', 2, '3–5'],
      ['deadlift', 2, '3–5'],
      ['bench_press', 2, '5'],
      ['pull_up', 2, '5'],
    ],
  }),
  session('peakr_peak_home', 'light', 'why.strength.peakrPeak', {
    rpe: 7,
    durationMin: 30,
    exercises: [
      ['split_squat', 2, '5'],
      ['single_leg_rdl', 2, '5'],
      ['push_up', 2, '8'],
      ['inverted_row', 2, '8'],
    ],
  }),
  session('core_mobility', 'none', 'why.strength.coreMobility', {
    rpe: 4,
    durationMin: 25,
    exercises: [...core, ...mobility.slice(0, 3)],
  }),

  // Split sessions (§8.2).
  session('full_a', 'heavy', 'why.strength.fullBody', {
    rpe: 7.5,
    durationMin: 55,
    exercises: [
      ['back_squat', 3, '6–10'],
      ['bench_press', 3, '6–10'],
      ['barbell_row', 3, '8–12'],
      ['plank', 3, '45 s'],
    ],
  }),
  session('full_b', 'heavy', 'why.strength.fullBody', {
    rpe: 7.5,
    durationMin: 55,
    exercises: [
      ['deadlift', 3, '5–8'],
      ['overhead_press', 3, '6–10'],
      ['pull_up', 3, '6–10'],
      ['walking_lunge', 2, '10'],
    ],
  }),
  session('full_c', 'light', 'why.strength.fullBody', {
    rpe: 7,
    durationMin: 50,
    exercises: [
      ['goblet_squat', 3, '10–12'],
      ['incline_press', 3, '8–12'],
      ['lat_pulldown', 3, '8–12'],
      ['glute_bridge', 3, '12'],
      ['pallof_press', 3, '10'],
    ],
  }),
  session('upper', 'none', 'why.strength.upper', {
    rpe: 7.5,
    durationMin: 50,
    exercises: [
      ['bench_press', 3, '6–10'],
      ['barbell_row', 3, '8–12'],
      ['overhead_press', 3, '8–10'],
      ['lat_pulldown', 3, '8–12'],
      ['biceps_curl', 2, '10–12'],
      ['triceps_pushdown', 2, '10–12'],
    ],
  }),
  session('lower', 'heavy', 'why.strength.legs', {
    rpe: 7.5,
    durationMin: 50,
    exercises: [
      ['back_squat', 3, '6–10'],
      ['romanian_deadlift', 3, '8–10'],
      ['bulgarian_split_squat', 3, '8'],
      ['standing_calf_raise', 3, '12'],
    ],
  }),
  session('push', 'none', 'why.strength.upper', {
    rpe: 7.5,
    durationMin: 45,
    exercises: [
      ['bench_press', 4, '6–10'],
      ['overhead_press', 3, '8–10'],
      ['dips', 3, '8–12'],
      ['lateral_raise', 3, '12–15'],
      ['triceps_pushdown', 3, '10–12'],
    ],
  }),
  session('pull', 'none', 'why.strength.upper', {
    rpe: 7.5,
    durationMin: 45,
    exercises: [
      ['pull_up', 4, '6–10'],
      ['barbell_row', 3, '8–10'],
      ['face_pull', 3, '12–15'],
      ['hammer_curl', 3, '10–12'],
    ],
  }),
  session('legs', 'heavy', 'why.strength.legs', {
    rpe: 8,
    durationMin: 50,
    exercises: [
      ['back_squat', 4, '6–10'],
      ['romanian_deadlift', 3, '8–10'],
      ['leg_press', 3, '10–12'],
      ['standing_calf_raise', 4, '12'],
    ],
  }),
  session('chest', 'none', 'why.strength.upper', {
    rpe: 7.5,
    durationMin: 45,
    exercises: [
      ['bench_press', 4, '6–10'],
      ['incline_press', 3, '8–12'],
      ['dips', 3, '10'],
    ],
  }),
  session('back', 'none', 'why.strength.upper', {
    rpe: 7.5,
    durationMin: 45,
    exercises: [
      ['pull_up', 4, '6–10'],
      ['barbell_row', 3, '8–10'],
      ['seated_cable_row', 3, '10–12'],
    ],
  }),
  session('shoulders', 'none', 'why.strength.upper', {
    rpe: 7.5,
    durationMin: 40,
    exercises: [
      ['overhead_press', 4, '6–10'],
      ['lateral_raise', 3, '12–15'],
      ['face_pull', 3, '12–15'],
    ],
  }),
  session('arms', 'none', 'why.strength.upper', {
    rpe: 7,
    durationMin: 35,
    exercises: [
      ['biceps_curl', 3, '10–12'],
      ['hammer_curl', 3, '10–12'],
      ['triceps_pushdown', 3, '10–12'],
      ['overhead_triceps_extension', 3, '10–12'],
    ],
  }),
  session('glutes_a', 'heavy', 'why.strength.legs', {
    rpe: 8,
    durationMin: 50,
    exercises: [
      ['hip_thrust', 4, '8–12'],
      ['romanian_deadlift', 3, '8–10'],
      ['bulgarian_split_squat', 3, '8'],
      ['glute_bridge', 3, '15'],
    ],
  }),
  session('legs_b', 'heavy', 'why.strength.legs', {
    rpe: 8,
    durationMin: 50,
    exercises: [
      ['front_squat', 4, '6–8'],
      ['walking_lunge', 3, '10'],
      ['leg_press', 3, '10–12'],
      ['standing_calf_raise', 3, '12'],
    ],
  }),
  session('runners_a', 'light', 'why.strength.runners', {
    rpe: 7,
    durationMin: 35,
    exercises: [
      ['single_leg_rdl', 3, '8'],
      ['step_up', 3, '10'],
      ['bent_knee_calf_raise', 3, '15'],
      ['copenhagen_plank', 2, '20 s'],
      ['dead_bug', 3, '10'],
    ],
  }),
  session('runners_b', 'heavy', 'why.strength.runners', {
    rpe: 7.5,
    durationMin: 35,
    exercises: [
      ['bulgarian_split_squat', 3, '6–8'],
      ['hip_thrust', 3, '8'],
      ['pogo_hops', 3, '10'],
      ['standing_calf_raise', 3, '12'],
      ['side_plank', 2, '30 s'],
    ],
  }),
  session('core', 'none', 'why.strength.coreMobility', {
    rpe: 5,
    durationMin: 25,
    exercises: core,
  }),
  session('mobility', 'none', 'why.strength.coreMobility', {
    rpe: 3,
    durationMin: 25,
    exercises: mobility,
  }),
  session('kettlebell_a', 'light', 'why.strength.fullBody', {
    rpe: 7,
    durationMin: 35,
    exercises: [
      ['kettlebell_swing', 4, '15'],
      ['goblet_squat', 3, '10'],
      ['dumbbell_row', 3, '10'],
      ['dumbbell_shoulder_press', 3, '10'],
    ],
  }),
  session('kettlebell_b', 'light', 'why.strength.fullBody', {
    rpe: 7,
    durationMin: 35,
    exercises: [
      ['reverse_lunge', 3, '10'],
      ['single_leg_rdl', 3, '8'],
      ['dumbbell_press', 3, '10'],
      ['pallof_press', 3, '10'],
    ],
  }),
  session('bodyweight_a', 'light', 'why.strength.fullBody', {
    rpe: 7,
    durationMin: 30,
    exercises: [
      ['bodyweight_squat', 3, '15–20'],
      ['push_up', 3, '8–15'],
      ['inverted_row', 3, '8–12'],
      ['glute_bridge', 3, '15'],
      ['plank', 3, '45 s'],
    ],
  }),
  session('bodyweight_b', 'light', 'why.strength.fullBody', {
    rpe: 7,
    durationMin: 30,
    exercises: [
      ['reverse_lunge', 3, '10'],
      ['pike_push_up', 3, '8–12'],
      ['single_leg_rdl', 3, '10'],
      ['side_plank', 3, '30 s'],
      ['bird_dog', 3, '10'],
    ],
  }),
];

export interface SplitDef {
  /** Session rotation (template ids without the `strength.` prefix). */
  rotation: string[];
  days: { min: number; max: number };
  /** Merged rotations when fewer days are available (§8.3). */
  reduced?: Partial<Record<number, string[]>>;
}

export const splits: Record<SplitId, SplitDef> = {
  fullBody: { rotation: ['full_a', 'full_b', 'full_c'], days: { min: 2, max: 3 } },
  upperLower: {
    rotation: ['upper', 'lower'],
    days: { min: 2, max: 4 },
    reduced: { 1: ['full_a'] },
  },
  pushPullLegs: {
    rotation: ['push', 'pull', 'legs'],
    days: { min: 3, max: 6 },
    reduced: { 2: ['upper', 'legs'], 1: ['full_a'] },
  },
  bodyPart: {
    rotation: ['chest', 'back', 'shoulders', 'legs', 'arms'],
    days: { min: 4, max: 5 },
    reduced: { 3: ['push', 'pull', 'legs'], 2: ['upper', 'legs'], 1: ['full_a'] },
  },
  glutesLegs: { rotation: ['glutes_a', 'legs_b', 'upper'], days: { min: 2, max: 3 } },
  runners: { rotation: ['runners_a', 'runners_b'], days: { min: 2, max: 2 } },
  coreMobility: { rotation: ['core', 'mobility'], days: { min: 2, max: 4 } },
  kettlebell: { rotation: ['kettlebell_a', 'kettlebell_b'], days: { min: 2, max: 3 } },
  bodyweight: { rotation: ['bodyweight_a', 'bodyweight_b'], days: { min: 2, max: 3 } },
};
