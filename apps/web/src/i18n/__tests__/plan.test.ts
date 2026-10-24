import { describe, expect, it } from 'vitest';

import { createTranslate, t } from '../plan';

describe('plan translator', () => {
  const tr = createTranslate({
    a: { b: 'Hello {{name}}', n_one: '{{count}} minute', n_other: '{{count}} minutes' },
  });

  it('resolves dotted keys and placeholders', () => {
    expect(tr('a.b', { name: 'Ann' })).toBe('Hello Ann');
  });

  it('picks the plural form from count', () => {
    expect(tr('a.n', { count: 1 })).toBe('1 minute');
    expect(tr('a.n', { count: 5 })).toBe('5 minutes');
  });

  it('falls back to defaultValue, then to the key', () => {
    expect(tr('a.missing', { defaultValue: 'x' })).toBe('x');
    expect(tr('a.missing')).toBe('a.missing');
  });

  it('reads the shared quiz, workout and exercise texts', () => {
    expect(t('quiz.goal.title')).not.toBe('quiz.goal.title');
    expect(t('workoutText.minutes', { count: 30 })).toContain('30');
    expect(t('workouts.run.easy', { defaultValue: 'x' })).not.toBe('x');
    expect(t('common.yes')).toBe('Yes');
  });
});
