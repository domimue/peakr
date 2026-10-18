import en from './en.json';

// Single locale for now; becomes locale-aware when de/fr/it/es are added.
export const messages = en;

export type Messages = typeof en;

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
