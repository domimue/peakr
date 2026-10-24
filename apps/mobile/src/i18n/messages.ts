import enExercises from '@peakr/i18n/locales/en/exercises.json';
import enPlan from '@peakr/i18n/locales/en/plan.json';

import en from './locales/en.json';

/** Deep merge of two translation trees (`b` wins on leaves). */
function merge<A extends object, B extends object>(a: A, b: B): A & B {
  const out = { ...a } as Record<string, unknown>;
  for (const [key, value] of Object.entries(b)) {
    const prev = out[key];
    out[key] =
      prev && typeof prev === 'object' && value && typeof value === 'object'
        ? merge(prev as object, value as object)
        : value;
  }
  return out as A & B;
}

/**
 * The app's English texts: its own `locales/en.json` plus the quiz, forecast and workout texts
 * from `@peakr/i18n` (`plan.json`), shared with the website so the quiz reads the same on both
 * surfaces. No side effects, so tests can import it.
 */
export const enMessages = merge(en, enPlan);

export { enExercises };
