import 'server-only';

import exercises from '@peakr/i18n/locales/en/exercises.json';

import { createTranslate, PLAN_TREE, type Tree } from './plan';

/** Translator for server-rendered workouts: the plan texts plus the exercise library names. */
export const tWorkout = createTranslate({ ...PLAN_TREE, exercises: exercises as Tree });
