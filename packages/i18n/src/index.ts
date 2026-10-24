/**
 * Shared i18n configuration and translation files for web and app.
 * - `common`: keys both surfaces use with the same meaning (zones, units, validation, …)
 * - `web`: website-only copy (marketing, tools pages, funnel, account, legal)
 * - `plan`: the onboarding quiz, the forecast and the texts of planned workouts (names, why, notes,
 *   steps) – the app merges them into its own resources, the web renders the quiz and week 1 with
 *   them, so both surfaces say exactly the same
 * - `exercises`: names and descriptions of the strength exercise library, by exercise id
 * Placeholders use the i18next syntax `{{name}}` on both surfaces.
 */
import enCommon from './locales/en/common.json';
import enExercises from './locales/en/exercises.json';
import enPlan from './locales/en/plan.json';
import enWeb from './locales/en/web.json';

export const supportedLanguages = ['en'] as const;
export const plannedLanguages = ['de', 'fr', 'it', 'es'] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage: SupportedLanguage = 'en';

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (supportedLanguages as readonly string[]).includes(value);
}

export const translations = {
  en: { common: enCommon, web: enWeb, plan: enPlan, exercises: enExercises },
} as const satisfies Record<
  SupportedLanguage,
  { common: object; web: object; plan: object; exercises: object }
>;

export type CommonMessages = typeof enCommon;
export type WebMessages = typeof enWeb;
export type PlanMessages = typeof enPlan;
export type ExerciseMessages = typeof enExercises;
