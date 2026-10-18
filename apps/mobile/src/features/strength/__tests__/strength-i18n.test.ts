import { exercises, workoutLibrary } from '@peakr/engine';
import { strengthQuestions } from '@peakr/quiz';

import en from '@/i18n/locales/en.json';

function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
}

describe('strength translations', () => {
  it('has a name and how-to for every library exercise', () => {
    for (const e of exercises) {
      expect(typeof lookup(`exercises.${e.id}.name`)).toBe('string');
      expect(typeof lookup(`exercises.${e.id}.howTo`)).toBe('string');
    }
  });

  it('has a title for every strength session type', () => {
    for (const t of workoutLibrary.filter((x) => x.sport === 'strength')) {
      expect(typeof lookup(`strength.types.${t.type}`)).toBe('string');
    }
  });

  it('has every quiz text of the strength questions', () => {
    for (const q of strengthQuestions) {
      expect(typeof lookup(q.titleKey)).toBe('string');
      if (q.hintKey) expect(typeof lookup(q.hintKey)).toBe('string');
      if (q.kind === 'single') {
        for (const o of q.options) {
          expect(typeof lookup(o.labelKey)).toBe('string');
          if (o.descriptionKey) expect(typeof lookup(o.descriptionKey)).toBe('string');
        }
      }
    }
  });
});
