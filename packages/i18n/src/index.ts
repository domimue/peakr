/**
 * Shared i18n configuration and translation files for web and app.
 * - `common`: keys both surfaces use with the same meaning (zones, units, validation, …)
 * - `web`: website-only copy (marketing, tools pages, waitlist, legal)
 * Placeholders use the i18next syntax `{{name}}` on both surfaces.
 */
import enCommon from './locales/en/common.json';
import enWeb from './locales/en/web.json';

export const supportedLanguages = ['en'] as const;
export const plannedLanguages = ['de', 'fr', 'it', 'es'] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage: SupportedLanguage = 'en';

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (supportedLanguages as readonly string[]).includes(value);
}

export const translations = {
  en: { common: enCommon, web: enWeb },
} as const satisfies Record<SupportedLanguage, { common: object; web: object }>;

export type CommonMessages = typeof enCommon;
export type WebMessages = typeof enWeb;
