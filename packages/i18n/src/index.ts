/**
 * Shared i18n configuration for web and app. Translation files are added here once
 * web and app share keys (quiz, paywall, ...).
 */

export const supportedLanguages = ['en'] as const;
export const plannedLanguages = ['de', 'fr', 'it', 'es'] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage: SupportedLanguage = 'en';

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (supportedLanguages as readonly string[]).includes(value);
}
