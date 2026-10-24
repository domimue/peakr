import { workoutLibrary } from '@peakr/engine';
import { BARRIERS, onboardingQuestions } from '@peakr/quiz';

import { enMessages as en } from '@/i18n/messages';

function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
}

/** Plural keys exist as `_one` / `_other`. */
const has = (key: string) =>
  typeof lookup(key) === 'string' || typeof lookup(`${key}_other`) === 'string';

describe('onboarding translations', () => {
  it('has every text of every quiz question', () => {
    const keys: string[] = [];
    for (const q of onboardingQuestions) {
      keys.push(q.titleKey);
      if (q.hintKey) keys.push(q.hintKey);
      if (q.kind === 'single' || q.kind === 'multi') {
        for (const o of q.options)
          keys.push(o.labelKey, ...(o.descriptionKey ? [o.descriptionKey] : []));
      }
      if ((q.kind === 'number' || q.kind === 'duration') && q.unitKey) keys.push(q.unitKey);
      if (q.kind === 'confirm') keys.push(q.labelKey);
    }
    expect(keys.filter((k) => !has(k))).toEqual([]);
  });

  it('has every insight, forecast line and validation message', () => {
    const keys = [
      'quiz.insights.zone2',
      'quiz.insights.zone2Estimate',
      'quiz.insights.weightloss',
      'quiz.insights.availability',
      'notes.noRaceDate',
      'notes.shortPreparation',
      'quiz.targetDate.clear',
      'quiz.targetDate.none',
      ...['triathlon', 'race', 'weightloss', 'fitness'].map((k) => `quiz.insights.goal.${k}`),
      ...['threshold', 'thresholdFromEasy', 'noReference'].map((k) => `quiz.insights.run.${k}`),
      ...['css', 'noTimes', 'technique'].map((k) => `quiz.insights.swim.${k}`),
      ...['ok', 'short', 'none'].map((k) => `quiz.insights.targetDate.${k}`),
      ...[...BARRIERS, 'none'].map((k) => `quiz.insights.barriers.${k}`),
      ...[
        'volume',
        'racePrediction',
        'raceCurrent',
        'threshold',
        'css',
        'easyShare',
        'oneLoad',
        'weightloss',
        'routinesPending',
      ].map((k) => `quiz.forecast.outcome.${k}`),
      ...['base', 'build', 'peak', 'taper', 'maintain'].map((k) => `quiz.forecast.phases.${k}`),
      ...[
        'required',
        'invalidOption',
        'tooFewSelected',
        'tooLong',
        'mustConfirm',
        'outOfRange',
        'invalidDate',
        'dateOutOfRange',
        'goalNeedsSports',
        'notEnoughAvailability',
        'underageWeightLoss',
        'restingHrNotBelowHrMax',
        'swim400NotSlowerThan200',
        'swimTimesInconsistent',
      ].map((k) => `validation.${k}`),
    ];
    expect(keys.filter((k) => !has(k))).toEqual([]);
  });

  it('has a title for every endurance workout', () => {
    const missing = workoutLibrary
      .filter((w) => w.sport !== 'strength')
      .map((w) => `workouts.${w.id}`)
      .filter((k) => !has(k));
    expect(missing).toEqual([]);
  });
});
