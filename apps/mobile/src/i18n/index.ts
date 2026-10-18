import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

export const resources = {
  en: { translation: en },
} as const;

export const defaultNS = 'translation';

const supported = Object.keys(resources);
const deviceLanguage = getLocales()[0]?.languageCode ?? 'en';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: supported.includes(deviceLanguage) ? deviceLanguage : 'en',
  fallbackLng: 'en',
  defaultNS,
  interpolation: { escapeValue: false },
});

export default i18n;
