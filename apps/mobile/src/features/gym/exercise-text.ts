import {
  exercises,
  isCustomExercise,
  resolveExercise,
  type CustomExercise,
  type Equipment,
  type Exercise,
  type ExercisePattern,
  type MatchCandidate,
  type MuscleGroup,
} from '@peakr/engine';
import type { TFunction } from 'i18next';

import type { IconName } from '@/ui';

/** Texts of library exercises (i18n `exercises.<id>.*`) and custom ones (stored inline). */

export interface ExerciseTexts {
  name: string;
  aliases: string[];
  instructions?: string;
  cues: string[];
  mistakes: string[];
}

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

export function exerciseTexts(t: TFunction, exercise: Exercise | CustomExercise): ExerciseTexts {
  if (isCustomExercise(exercise)) {
    return {
      name: exercise.name,
      aliases: exercise.aliases ?? [],
      ...(exercise.instructions ? { instructions: exercise.instructions } : {}),
      cues: exercise.cues ?? [],
      mistakes: exercise.mistakes ?? [],
    };
  }
  const key = exercise.howToKey;
  return {
    name: t(`${key}.name` as never) as string,
    aliases: list(t(`${key}.aliases` as never, { returnObjects: true })),
    instructions: t(`${key}.instructions` as never) as string,
    cues: list(t(`${key}.cues` as never, { returnObjects: true })),
    mistakes: list(t(`${key}.mistakes` as never, { returnObjects: true })),
  };
}

/** Display name of a library or custom exercise; unknown ids show the fallback or the id. */
export function exerciseLabel(
  t: TFunction,
  id: string,
  custom: readonly CustomExercise[],
  fallback?: string,
): string {
  const exercise = resolveExercise(id, custom);
  return exercise ? exerciseTexts(t, exercise).name : (fallback ?? id);
}

/** Library and custom exercises together, custom ones first. */
export function allExercises(custom: readonly CustomExercise[]): (Exercise | CustomExercise)[] {
  return [...custom, ...exercises];
}

export interface ExerciseFilter {
  query: string;
  pattern?: ExercisePattern;
  equipment?: Equipment;
  muscle?: MuscleGroup;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Library search: every word of the query must appear in the name or an alias. Name matches come
 * before alias matches; results are sorted by name.
 */
export function searchExercises(
  t: TFunction,
  list: readonly (Exercise | CustomExercise)[],
  filter: ExerciseFilter,
): (Exercise | CustomExercise)[] {
  const words = fold(filter.query).split(' ').filter(Boolean);
  const scored = list.flatMap((e) => {
    if (filter.pattern && e.pattern !== filter.pattern) return [];
    if (filter.equipment && !e.equipment.includes(filter.equipment)) return [];
    if (filter.muscle && !e.muscles.includes(filter.muscle)) return [];
    const texts = exerciseTexts(t, e);
    const name = fold(texts.name);
    if (words.every((w) => name.includes(w))) return [{ e, rank: 0, name: texts.name }];
    const aliases = texts.aliases.map(fold);
    if (words.every((w) => aliases.some((a) => a.includes(w)))) {
      return [{ e, rank: 1, name: texts.name }];
    }
    return [];
  });
  return scored.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)).map((s) => s.e);
}

/** Names the CSV import matches against: library (with aliases) and custom exercises. */
export function matchCandidates(t: TFunction, custom: readonly CustomExercise[]): MatchCandidate[] {
  return allExercises(custom).map((e) => {
    const texts = exerciseTexts(t, e);
    return { id: e.id, names: [texts.name, ...texts.aliases], equipment: e.equipment };
  });
}

/** One symbol per movement pattern until real illustrations exist (docs/gym-illustrations.md). */
export const PATTERN_ICONS: Record<ExercisePattern, IconName> = {
  squat: 'patternSquat',
  hinge: 'patternHinge',
  lunge: 'patternLunge',
  legIsolation: 'patternLegIsolation',
  calf: 'patternCalf',
  pushHorizontal: 'patternPushHorizontal',
  pushVertical: 'patternPushVertical',
  fly: 'patternFly',
  pullHorizontal: 'patternPullHorizontal',
  pullVertical: 'patternPullVertical',
  arms: 'patternArms',
  core: 'patternCore',
  carry: 'patternCarry',
  plyometrics: 'patternPlyometrics',
  mobility: 'patternMobility',
  other: 'patternOther',
};
