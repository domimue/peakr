import { getLocales } from 'expo-localization';
import { create } from 'zustand';

import * as repo from '@/data/repositories/settings-repository';
import i18n from '@/i18n';

import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type LanguagePreference,
  type ThemePreference,
  type Units,
} from './app-settings';

export type { LanguagePreference, ThemePreference, Units } from './app-settings';

interface SettingsState extends AppSettings {
  /** True once the stored settings were read (the defaults apply until then). */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setThemePreference: (preference: ThemePreference) => void;
  setUnits: (units: Units) => void;
  setHaptics: (haptics: boolean) => void;
  setLanguage: (language: LanguagePreference) => void;
}

const pick = (s: SettingsState): AppSettings => ({
  themePreference: s.themePreference,
  units: s.units,
  haptics: s.haptics,
  language: s.language,
});

/** The device language if Peakr has it, else English (only English ships for now). */
function applyLanguage(language: LanguagePreference): void {
  const supported = Object.keys(i18n.options.resources ?? {});
  const device = getLocales()[0]?.languageCode ?? 'en';
  const lng = language === 'system' ? (supported.includes(device) ? device : 'en') : language;
  if (i18n.language !== lng) void i18n.changeLanguage(lng);
}

export const useSettingsStore = create<SettingsState>()((set, get) => {
  const update = (patch: Partial<AppSettings>) => {
    set(patch);
    repo
      .saveAppSettings(pick(get()))
      .catch((e: unknown) => console.warn('Saving the settings failed', e));
  };
  return {
    ...DEFAULT_APP_SETTINGS,
    hydrated: false,
    hydrate: async () => {
      try {
        const stored = await repo.getAppSettings();
        set({ ...stored, hydrated: true });
        applyLanguage(stored.language);
      } catch (e) {
        console.warn('Reading the settings failed', e);
        set({ hydrated: true });
      }
    },
    setThemePreference: (themePreference) => update({ themePreference }),
    setUnits: (units) => update({ units }),
    setHaptics: (haptics) => update({ haptics }),
    setLanguage: (language) => {
      update({ language });
      applyLanguage(language);
    },
  };
});
