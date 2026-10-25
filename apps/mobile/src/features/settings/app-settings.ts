/**
 * Device settings of the app (Profile → Settings / Appearance): theme, units, haptics, language.
 * Stored in SQLite (`app_settings`, key `app.settings`); unknown or broken values fall back to the
 * defaults, so an old or damaged entry never breaks the start.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type Units = 'metric' | 'imperial';
/** `system` follows the device language when Peakr has it, else English. */
export type LanguagePreference = 'system' | 'en';

export interface AppSettings {
  themePreference: ThemePreference;
  units: Units;
  haptics: boolean;
  language: LanguagePreference;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  // The app is dark by default; light mode is optional.
  themePreference: 'dark',
  units: 'metric',
  haptics: true,
  language: 'system',
};

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

export function parseAppSettings(raw: unknown): AppSettings {
  const d = DEFAULT_APP_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Partial<Record<keyof AppSettings, unknown>>;
  return {
    themePreference: oneOf(r.themePreference, ['system', 'light', 'dark'], d.themePreference),
    units: oneOf(r.units, ['metric', 'imperial'], d.units),
    haptics: typeof r.haptics === 'boolean' ? r.haptics : d.haptics,
    language: oneOf(r.language, ['system', 'en'], d.language),
  };
}
