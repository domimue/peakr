import { generatePlan, splits } from '@peakr/engine';
import { describe, expect, it } from 'vitest';

import { validateAnswers, visibleQuestions, withDefaults, type QuizAnswers } from './model';
import {
  SPLIT_IDS,
  STRENGTH_QUESTION_IDS as Q,
  strengthAnswersFrom,
  strengthQuestions,
  toStrengthSetup,
} from './strength';

const ids = (a: QuizAnswers) => visibleQuestions(strengthQuestions, a).map((q) => q.id);
const race = { raceGoal: true };

describe('strength questions', () => {
  it('branches by mode', () => {
    expect(ids({})).toEqual([Q.mode]);
    expect(ids({ [Q.mode]: 'none' })).toEqual([Q.mode]);
    expect(ids({ [Q.mode]: 'log' })).toEqual([Q.mode]);
    expect(ids({ [Q.mode]: 'peakr' })).toEqual([Q.mode, Q.equipment, Q.daysPerWeek, Q.priority]);
    expect(ids({ [Q.mode]: 'split' })).toEqual([
      Q.mode,
      Q.split,
      Q.equipment,
      Q.daysPerWeek,
      Q.priority,
    ]);
    expect(ids({ [Q.mode]: 'routines' })).toEqual([Q.mode, Q.daysPerWeek, Q.priority]);
  });

  it('offers every split of the engine', () => {
    const split = strengthQuestions.find((q) => q.id === Q.split);
    expect(split?.kind === 'single' && split.options.map((o) => o.value)).toEqual(SPLIT_IDS);
    expect(SPLIT_IDS).toEqual(Object.keys(splits));
  });

  it('fills defaults in order and drops answers of hidden questions', () => {
    expect(withDefaults(strengthQuestions, { [Q.mode]: 'peakr' }, race)).toEqual({
      [Q.mode]: 'peakr',
      [Q.daysPerWeek]: 2,
      [Q.priority]: 'enduranceFirst',
    });
    expect(
      withDefaults(
        strengthQuestions,
        { [Q.mode]: 'split', [Q.split]: 'pushPullLegs' },
        { raceGoal: false },
      ),
    ).toEqual({
      [Q.mode]: 'split',
      [Q.split]: 'pushPullLegs',
      [Q.daysPerWeek]: 3,
      [Q.priority]: 'balanced',
    });
    // No split chosen yet: no day default.
    expect(
      withDefaults(strengthQuestions, { [Q.mode]: 'split' }, race)[Q.daysPerWeek],
    ).toBeUndefined();
    expect(withDefaults(strengthQuestions, { [Q.mode]: 'routines' }, race)[Q.daysPerWeek]).toBe(2);
    expect(
      withDefaults(
        strengthQuestions,
        { [Q.mode]: 'log', [Q.split]: 'runners', [Q.daysPerWeek]: 3 },
        race,
      ),
    ).toEqual({ [Q.mode]: 'log' });
  });

  it('validates required answers, options and day ranges per split', () => {
    expect(validateAnswers(strengthQuestions, {})).toEqual([
      { questionId: Q.mode, code: 'required' },
    ]);
    expect(validateAnswers(strengthQuestions, { [Q.mode]: 'yoga' })).toEqual([
      { questionId: Q.mode, code: 'invalidOption' },
    ]);
    const ppl = {
      [Q.mode]: 'split',
      [Q.split]: 'pushPullLegs',
      [Q.equipment]: 'gym',
      [Q.priority]: 'balanced',
    };
    expect(validateAnswers(strengthQuestions, { ...ppl, [Q.daysPerWeek]: 2 })).toEqual([
      { questionId: Q.daysPerWeek, code: 'outOfRange', params: { min: 3, max: 6 } },
    ]);
    expect(validateAnswers(strengthQuestions, { ...ppl, [Q.daysPerWeek]: 3.5 })).toHaveLength(1);
    expect(validateAnswers(strengthQuestions, { ...ppl, [Q.daysPerWeek]: '3' })).toHaveLength(1);
    expect(validateAnswers(strengthQuestions, { ...ppl, [Q.daysPerWeek]: 6 })).toEqual([]);
    expect(
      validateAnswers(strengthQuestions, {
        [Q.mode]: 'peakr',
        [Q.equipment]: 'hotel',
        [Q.daysPerWeek]: 4,
        [Q.priority]: 'balanced',
      }),
    ).toEqual([{ questionId: Q.daysPerWeek, code: 'outOfRange', params: { min: 1, max: 3 } }]);
    expect(
      validateAnswers(strengthQuestions, {
        [Q.mode]: 'routines',
        [Q.daysPerWeek]: 6,
        [Q.priority]: 'strengthFirst',
      }),
    ).toEqual([]);
  });

  it('turns answers into an engine setup that generates a plan', () => {
    const answers = withDefaults(
      strengthQuestions,
      { [Q.mode]: 'split', [Q.split]: 'upperLower', [Q.equipment]: 'home' },
      race,
    );
    expect(validateAnswers(strengthQuestions, answers)).toEqual([]);
    const setup = toStrengthSetup(answers);
    expect(setup).toEqual({
      mode: 'split',
      split: 'upperLower',
      equipment: 'home',
      daysPerWeek: 2,
      priority: 'enduranceFirst',
    });
    const plan = generatePlan(
      { age: 30, experience: 'intermediate', sports: ['run'], terrain: 'flat', strength: setup },
      { kind: '10k' },
      { minutesPerDay: [60, 60, 60, 60, 60, 120, 90], doublesAllowed: false },
      '2026-11-02',
      '2027-02-28',
    );
    expect(plan.ok).toBe(true);
    expect(strengthAnswersFrom(setup)).toEqual(answers);
  });

  it('maps the other modes', () => {
    expect(toStrengthSetup({})).toEqual({ mode: 'none' });
    expect(toStrengthSetup({ [Q.mode]: 'log', [Q.priority]: 'balanced' })).toEqual({ mode: 'log' });
    const routines = [{ id: 'r', name: 'R', durationMin: 30, exercises: [] }];
    expect(toStrengthSetup({ [Q.mode]: 'routines', [Q.daysPerWeek]: 3 }, { routines })).toEqual({
      mode: 'routines',
      routines,
      customExercises: [],
      daysPerWeek: 3,
    });
    expect(toStrengthSetup({ [Q.mode]: 'routines' })).toEqual({
      mode: 'routines',
      routines: [],
      customExercises: [],
    });
    expect(toStrengthSetup({ [Q.mode]: 'split', [Q.split]: 'nope' })).toEqual({
      mode: 'split',
      split: undefined,
      equipment: undefined,
    });
    expect(strengthAnswersFrom({ mode: 'none' })).toEqual({ [Q.mode]: 'none' });
  });
});
