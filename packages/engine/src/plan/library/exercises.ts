import type { Result, ValidationIssue } from '../../result';
import type { LegLoad } from '../types';
import data from './exercises.json';

/**
 * Strength exercise library – WORKOUTS.md §8.6 and CLAUDE.md "Gym". The structure lives in
 * `exercises.json` (our own data); names, aliases, instructions, cues and common mistakes are
 * translations under `exercises.<id>` in the app's locale files. Users can add custom exercises and
 * edit copies of library exercises.
 */

export type ExercisePattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'legIsolation'
  | 'calf'
  | 'pushHorizontal'
  | 'pushVertical'
  | 'fly'
  | 'pullHorizontal'
  | 'pullVertical'
  | 'arms'
  | 'core'
  | 'carry'
  | 'plyometrics'
  | 'mobility'
  /** Only for custom exercises whose movement does not fit a pattern (e.g. imports). */
  | 'other';

export type Equipment =
  | 'barbell'
  | 'ezBar'
  | 'trapBar'
  | 'dumbbell'
  | 'kettlebell'
  | 'machine'
  | 'smith'
  | 'cable'
  | 'band'
  | 'bodyweight'
  | 'box';

export type MuscleGroup =
  | 'chest'
  | 'upper_back'
  | 'lats'
  | 'lower_back'
  | 'traps'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'adductors'
  | 'abductors'
  | 'calves'
  | 'shins'
  | 'hip_flexors'
  | 'neck';

/** What a set of this exercise records by default. */
export type TrackingMode = 'weightReps' | 'reps' | 'time' | 'distance' | 'weightTime';

export interface Exercise {
  id: string;
  pattern: ExercisePattern;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  /** Primary followed by secondary muscles. */
  muscles: MuscleGroup[];
  equipment: Equipment[];
  legLoad: LegLoad;
  unilateral: boolean;
  trackingMode: TrackingMode;
  /** i18n key prefix: `exercises.<id>.name`, `.aliases`, `.instructions`, `.cues`, `.mistakes`. */
  howToKey: string;
  /**
   * Slot for a real illustration (asset key, see docs/gym-illustrations.md). Until then the app shows
   * the icon of the movement pattern.
   */
  illustration?: string;
  videoUrl?: string;
}

/** An exercise the user added or a user-edited copy of a library exercise; carries its own texts. */
export interface CustomExercise extends Omit<Exercise, 'howToKey'> {
  /** Always `custom:<id>`. */
  id: string;
  name: string;
  aliases?: string[];
  instructions?: string;
  cues?: string[];
  mistakes?: string[];
  /** Library id this exercise was copied from. */
  basedOn?: string;
}

export const CUSTOM_PREFIX = 'custom:';

export const EXERCISE_PATTERNS: readonly ExercisePattern[] = [
  'squat',
  'hinge',
  'lunge',
  'legIsolation',
  'calf',
  'pushHorizontal',
  'pushVertical',
  'fly',
  'pullHorizontal',
  'pullVertical',
  'arms',
  'core',
  'carry',
  'plyometrics',
  'mobility',
  'other',
];

export const EQUIPMENT: readonly Equipment[] = [
  'barbell',
  'ezBar',
  'trapBar',
  'dumbbell',
  'kettlebell',
  'machine',
  'smith',
  'cable',
  'band',
  'bodyweight',
  'box',
];

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'chest',
  'upper_back',
  'lats',
  'lower_back',
  'traps',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'abductors',
  'calves',
  'shins',
  'hip_flexors',
  'neck',
];

export const TRACKING_MODES: readonly TrackingMode[] = [
  'weightReps',
  'reps',
  'time',
  'distance',
  'weightTime',
];

const LEG_LOADS: readonly LegLoad[] = ['none', 'light', 'heavy'];

/** Patterns that train the legs (lower-body progression steps, §8.5). */
export const LOWER_BODY_PATTERNS: readonly ExercisePattern[] = [
  'squat',
  'hinge',
  'lunge',
  'legIsolation',
  'calf',
  'plyometrics',
];

/** One entry of `exercises.json`. */
export interface ExerciseRecord {
  id: string;
  pattern: string;
  primary: string[];
  secondary?: string[];
  equipment: string[];
  legLoad: string;
  unilateral?: boolean;
  tracking: string;
  illustration?: string;
}

function oneOf<T extends string>(allowed: readonly T[], value: string, what: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`exercise library: unknown ${what} "${value}"`);
  }
  return value as T;
}

/** Validates the raw library data; a bad entry is a data bug and fails loudly (and in tests). */
export function parseExerciseRecords(records: readonly ExerciseRecord[]): Exercise[] {
  const seen = new Set<string>();
  return records.map((r) => {
    if (!/^[a-z0-9_]+$/.test(r.id)) throw new Error(`exercise library: bad id "${r.id}"`);
    if (seen.has(r.id)) throw new Error(`exercise library: duplicate id "${r.id}"`);
    seen.add(r.id);
    const primaryMuscles = r.primary.map((m) => oneOf(MUSCLE_GROUPS, m, 'muscle'));
    const secondaryMuscles = (r.secondary ?? []).map((m) => oneOf(MUSCLE_GROUPS, m, 'muscle'));
    if (primaryMuscles.length === 0) throw new Error(`exercise library: ${r.id} has no muscles`);
    if (r.equipment.length === 0) throw new Error(`exercise library: ${r.id} has no equipment`);
    return {
      id: r.id,
      pattern: oneOf(EXERCISE_PATTERNS, r.pattern, 'pattern'),
      primaryMuscles,
      secondaryMuscles,
      muscles: [...primaryMuscles, ...secondaryMuscles],
      equipment: r.equipment.map((e) => oneOf(EQUIPMENT, e, 'equipment')),
      legLoad: oneOf(LEG_LOADS, r.legLoad, 'legLoad'),
      unilateral: r.unilateral ?? false,
      trackingMode: oneOf(TRACKING_MODES, r.tracking, 'tracking mode'),
      howToKey: `exercises.${r.id}`,
      ...(r.illustration ? { illustration: r.illustration } : {}),
    };
  });
}

export const exercises: readonly Exercise[] = parseExerciseRecords(data as ExerciseRecord[]);

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

export function isCustomExercise(e: Exercise | CustomExercise): e is CustomExercise {
  return 'name' in e;
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

export type CustomExerciseField = 'name' | 'equipment' | 'muscles';

export interface CustomExerciseInput {
  id: string;
  name: string;
  pattern: ExercisePattern;
  equipment: Equipment[];
  legLoad: LegLoad;
  unilateral?: boolean;
  primaryMuscles?: MuscleGroup[];
  secondaryMuscles?: MuscleGroup[];
  trackingMode?: TrackingMode;
  aliases?: string[];
  instructions?: string;
  cues?: string[];
  mistakes?: string[];
  basedOn?: string;
}

const DEFAULT_TRACKING: Partial<Record<ExercisePattern, TrackingMode>> = {
  mobility: 'time',
  carry: 'weightTime',
};

const trimList = (list: readonly string[] | undefined): string[] =>
  (list ?? []).map((s) => s.trim()).filter((s) => s.length > 0);

/** Validates a user-defined exercise (or an edited library copy); the id gets the `custom:` prefix. */
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
  const primaryMuscles = [...new Set(input.primaryMuscles ?? [])];
  const secondaryMuscles = [...new Set(input.secondaryMuscles ?? [])].filter(
    (m) => !primaryMuscles.includes(m),
  );
  const instructions = input.instructions?.trim();
  const aliases = trimList(input.aliases);
  const cues = trimList(input.cues);
  const mistakes = trimList(input.mistakes);
  return {
    ok: true,
    value: {
      id: input.id.startsWith(CUSTOM_PREFIX) ? input.id : `${CUSTOM_PREFIX}${input.id}`,
      name,
      pattern: input.pattern,
      primaryMuscles,
      secondaryMuscles,
      muscles: [...primaryMuscles, ...secondaryMuscles],
      equipment: [...new Set(input.equipment)],
      legLoad: input.legLoad,
      unilateral: input.unilateral ?? false,
      trackingMode: input.trackingMode ?? DEFAULT_TRACKING[input.pattern] ?? 'weightReps',
      ...(aliases.length > 0 ? { aliases } : {}),
      ...(instructions ? { instructions } : {}),
      ...(cues.length > 0 ? { cues } : {}),
      ...(mistakes.length > 0 ? { mistakes } : {}),
      ...(input.basedOn ? { basedOn: input.basedOn } : {}),
    },
  };
}

/** Fields of a library exercise as input for an editable copy (texts filled in by the caller). */
export function copyInputOf(
  exercise: Exercise,
  texts: Pick<CustomExerciseInput, 'name' | 'aliases' | 'instructions' | 'cues' | 'mistakes'>,
  id: string,
): CustomExerciseInput {
  return {
    id,
    pattern: exercise.pattern,
    equipment: [...exercise.equipment],
    legLoad: exercise.legLoad,
    unilateral: exercise.unilateral,
    primaryMuscles: [...exercise.primaryMuscles],
    secondaryMuscles: [...exercise.secondaryMuscles],
    trackingMode: exercise.trackingMode,
    basedOn: exercise.id,
    ...texts,
  };
}
