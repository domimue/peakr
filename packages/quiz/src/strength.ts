import {
  splits,
  type CustomExercise,
  type Routine,
  type SplitId,
  type StrengthEquipment,
  type StrengthMode,
  type StrengthPriority,
  type StrengthSetup,
} from '@peakr/engine';

import type { QuizAnswers, QuizOption, QuizQuestion } from './model';

/** Strength questions (WORKOUTS.md §8.1): mode → split → equipment → days → priority. */

export const STRENGTH_MODES: readonly StrengthMode[] = [
  'peakr',
  'split',
  'routines',
  'log',
  'none',
];
export const SPLIT_IDS = Object.keys(splits) as SplitId[];
export const STRENGTH_EQUIPMENT: readonly StrengthEquipment[] = ['gym', 'home', 'hotel'];
export const STRENGTH_PRIORITIES: readonly StrengthPriority[] = [
  'enduranceFirst',
  'balanced',
  'strengthFirst',
];

export const STRENGTH_QUESTION_IDS = {
  mode: 'strength.mode',
  split: 'strength.split',
  equipment: 'strength.equipment',
  daysPerWeek: 'strength.daysPerWeek',
  priority: 'strength.priority',
} as const;

const Q = STRENGTH_QUESTION_IDS;

/** Peakr programme: 1–3 sessions (§8.4); own routines: up to 6. */
const DAYS = { peakr: { min: 1, max: 3 }, routines: { min: 1, max: 6 } } as const;
const DEFAULT_DAYS = { peakr: 2, routines: 2 } as const;

function options(id: string, values: readonly string[], withDescription = true): QuizOption[] {
  return values.map((value) => ({
    value,
    labelKey: `quiz.${id}.options.${value}.label`,
    ...(withDescription ? { descriptionKey: `quiz.${id}.options.${value}.description` } : {}),
  }));
}

const mode = (a: QuizAnswers) => a[Q.mode] as StrengthMode | undefined;
const plans = (a: QuizAnswers) => ['peakr', 'split', 'routines'].includes(mode(a) ?? '');

function splitOf(a: QuizAnswers): SplitId | undefined {
  const s = a[Q.split];
  return SPLIT_IDS.includes(s as SplitId) ? (s as SplitId) : undefined;
}

function daysRange(a: QuizAnswers): { min: number; max: number } {
  const split = splitOf(a);
  if (mode(a) === 'split' && split) return { ...splits[split].days };
  return mode(a) === 'peakr' ? DAYS.peakr : DAYS.routines;
}

export const strengthQuestions: readonly QuizQuestion[] = [
  {
    id: Q.mode,
    kind: 'single',
    titleKey: 'quiz.strength.mode.title',
    hintKey: 'quiz.strength.mode.hint',
    options: options('strength.mode', STRENGTH_MODES),
  },
  {
    id: Q.split,
    kind: 'single',
    titleKey: 'quiz.strength.split.title',
    options: options('strength.split', SPLIT_IDS),
    visibleIf: (a) => mode(a) === 'split',
  },
  {
    id: Q.equipment,
    kind: 'single',
    titleKey: 'quiz.strength.equipment.title',
    hintKey: 'quiz.strength.equipment.hint',
    options: options('strength.equipment', STRENGTH_EQUIPMENT),
    visibleIf: (a) => mode(a) === 'peakr' || mode(a) === 'split',
  },
  {
    id: Q.daysPerWeek,
    kind: 'number',
    titleKey: 'quiz.strength.daysPerWeek.title',
    hintKey: 'quiz.strength.daysPerWeek.hint',
    unitKey: 'quiz.strength.daysPerWeek.unit',
    range: daysRange,
    visibleIf: plans,
    defaultValue: (a) => {
      const split = splitOf(a);
      if (mode(a) === 'split') return split ? splits[split].days.min : undefined;
      return mode(a) === 'peakr' ? DEFAULT_DAYS.peakr : DEFAULT_DAYS.routines;
    },
  },
  {
    id: Q.priority,
    kind: 'single',
    titleKey: 'quiz.strength.priority.title',
    hintKey: 'quiz.strength.priority.hint',
    options: options('strength.priority', STRENGTH_PRIORITIES),
    visibleIf: plans,
    // Same default as the engine: endurance first with a race goal, else balanced.
    defaultValue: (_a, ctx) => (ctx.raceGoal ? 'enduranceFirst' : 'balanced'),
  },
];

/** Previous setup → answers (Profile → Strength edits the saved setup with the same questions). */
export function strengthAnswersFrom(setup: StrengthSetup): QuizAnswers {
  const answers: Record<string, string | number> = { [Q.mode]: setup.mode };
  if (setup.split) answers[Q.split] = setup.split;
  if (setup.equipment) answers[Q.equipment] = setup.equipment;
  if (setup.daysPerWeek !== undefined) answers[Q.daysPerWeek] = setup.daysPerWeek;
  if (setup.priority) answers[Q.priority] = setup.priority;
  return answers;
}

/**
 * Validated answers → engine `StrengthSetup`. Routines and custom exercises live in the user's
 * library, not in the quiz, and are passed in.
 */
export function toStrengthSetup(
  answers: QuizAnswers,
  library: { routines?: Routine[]; customExercises?: CustomExercise[] } = {},
): StrengthSetup {
  const m = mode(answers) ?? 'none';
  const setup: StrengthSetup = { mode: m };
  if (m === 'none' || m === 'log') return setup;
  if (m === 'split') setup.split = splitOf(answers);
  if (m === 'peakr' || m === 'split') {
    setup.equipment = answers[Q.equipment] as StrengthEquipment | undefined;
  }
  if (m === 'routines') {
    setup.routines = library.routines ?? [];
    setup.customExercises = library.customExercises ?? [];
  }
  const days = answers[Q.daysPerWeek];
  if (typeof days === 'number') setup.daysPerWeek = days;
  const priority = answers[Q.priority];
  if (priority !== undefined) setup.priority = priority as StrengthPriority;
  return setup;
}
