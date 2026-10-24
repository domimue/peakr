import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { enExercises, enMessages } from './messages';

/** Typed UI texts: `t('...')` keys are checked against these (see `i18next.d.ts`). */
export const resources = {
  en: { translation: enMessages },
} as const;

/**
 * Exercise library texts (CLAUDE.md "Gym", shared with the website) are merged in as
 * `exercises.<id>.*` at runtime. They are looked up by exercise id, so they stay out of the typed
 * keys (which would otherwise grow past what the compiler can check).
 */
const exerciseTexts = { en: enExercises } as const;

export const defaultNS = 'translation';

const supported = Object.keys(resources);
const deviceLanguage = getLocales()[0]?.languageCode ?? 'en';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries(resources).map(([lng, r]) => [
      lng,
      {
        translation: {
          ...r.translation,
          exercises: exerciseTexts[lng as keyof typeof exerciseTexts],
        },
      },
    ]),
  ),
  lng: supported.includes(deviceLanguage) ? deviceLanguage : 'en',
  fallbackLng: 'en',
  defaultNS,
  interpolation: { escapeValue: false },
});

export default i18n;
