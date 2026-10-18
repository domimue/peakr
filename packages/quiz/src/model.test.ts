import { describe, expect, it } from 'vitest';

import { dayToIso, isoToDay, validateAnswers, withDefaults, type QuizQuestion } from './model';

const ctx = { raceGoal: false, today: '2026-10-18' };

const questions: QuizQuestion[] = [
  {
    id: 'multi',
    kind: 'multi',
    titleKey: 'x',
    options: [
      { value: 'a', labelKey: 'a' },
      { value: 'b', labelKey: 'b' },
    ],
    minSelected: 1,
  },
  { id: 'time', kind: 'duration', titleKey: 'x', range: () => ({ min: 60, max: 600 }) },
  {
    id: 'week',
    kind: 'weekMinutes',
    titleKey: 'x',
    range: { min: 0, max: 600, step: 15 },
    defaultValue: () => [0, 30, 0, 30, 0, 60, 0],
  },
  { id: 'date', kind: 'date', titleKey: 'x', rangeDays: { min: 14, max: 100 } },
  { id: 'text', kind: 'text', titleKey: 'x', maxLength: 5, optional: true },
  { id: 'ok', kind: 'confirm', titleKey: 'x', labelKey: 'y' },
];

const valid = {
  multi: ['a'],
  time: 300,
  week: [0, 30, 0, 30, 0, 60, 0],
  date: '2026-11-30',
  ok: true,
};

describe('question kinds', () => {
  it('accepts valid answers and leaves optional ones empty', () => {
    expect(validateAnswers(questions, valid, ctx)).toEqual([]);
    expect(validateAnswers(questions, { ...valid, text: '  ' }, ctx)).toEqual([]);
  });

  it('fills array defaults', () => {
    expect(withDefaults(questions, {}, ctx)).toEqual({ week: [0, 30, 0, 30, 0, 60, 0] });
  });

  it('reports one issue per broken answer', () => {
    const issues = validateAnswers(
      questions,
      {
        multi: [],
        time: 30,
        week: [0, 30, 0, 30, 0, 60],
        date: '2026-10-20',
        text: 'too long',
        ok: false,
      },
      ctx,
    );
    expect(issues).toEqual([
      { questionId: 'multi', code: 'tooFewSelected', params: { min: 1 } },
      { questionId: 'time', code: 'outOfRange', params: { min: 60, max: 600 } },
      { questionId: 'week', code: 'outOfRange', params: { min: 0, max: 600 } },
      { questionId: 'date', code: 'outOfRange', params: { min: 14, max: 100 } },
      { questionId: 'text', code: 'tooLong', params: { max: 5 } },
      { questionId: 'ok', code: 'mustConfirm' },
    ]);
  });

  it('rejects unknown and duplicate options, invalid dates and missing confirmations', () => {
    const issues = validateAnswers(
      questions,
      { ...valid, multi: ['a', 'a'], date: '2026-02-30', ok: undefined },
      ctx,
    );
    expect(issues.map((i) => [i.questionId, i.code])).toEqual([
      ['multi', 'invalidOption'],
      ['date', 'invalidDate'],
      ['ok', 'mustConfirm'],
    ]);
    expect(validateAnswers(questions, { ...valid, multi: ['c'] }, ctx)[0]?.code).toBe(
      'invalidOption',
    );
  });

  it('converts ISO dates', () => {
    expect(isoToDay('1970-01-02')).toBe(1);
    expect(isoToDay('2026-13-01')).toBeNull();
    expect(isoToDay('18.10.2026')).toBeNull();
    expect(dayToIso(isoToDay('2028-02-29') ?? 0)).toBe('2028-02-29');
  });
});
