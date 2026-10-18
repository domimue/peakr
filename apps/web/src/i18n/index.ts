import { defaultLanguage, translations } from '@peakr/i18n';

// Single locale for now; becomes locale-aware when de/fr/it/es are added.
const { common, web } = translations[defaultLanguage];

/** Shared keys (zones, units, validation, …) plus the website-only copy, from /packages/i18n. */
export const messages = { ...common, ...web };

export type Messages = typeof messages;

/** Replaces `{{name}}` placeholders (i18next syntax, same as the app) with the given values. */
export function interpolate(
  template: string,
  params: Readonly<Record<string, string | number | null | undefined>>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}
