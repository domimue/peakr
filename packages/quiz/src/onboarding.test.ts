import { generatePlan } from '@peakr/engine';
import { describe, expect, it } from 'vitest';

import { buildForecast } from './forecast';
import type { QuizAnswers } from './model';
import {
  clearAnswer,
  commuteOf,
  ONBOARDING_STEPS,
  planStartDate,
  prepareAnswers,
  QUESTION_IDS as Q,
  setAnswer,
  stepInsight,
  stepIssues,
  stepQuestions,
  toPlanInput,
  validateOnboarding,
  visibleSteps,
  type OnboardingResult,
} from './onboarding';
import { STRENGTH_QUESTION_IDS as S } from './strength';

/** A Sunday. */
const TODAY = '2026-10-18';

const halfMarathon: QuizAnswers = {
  [Q.goal]: 'half',
  [Q.sports]: ['run'],
  [S.mode]: 'peakr',
  [S.equipment]: 'home',
  [Q.experience]: 'intermediate',
  [Q.runReference]: '10k',
  [Q.runRaceTime]: 50 * 60,
  [Q.restingHr]: 52,
  [Q.availability]: [0, 60, 45, 60, 0, 120, 45],
  [Q.terrain]: 'rolling',
  [Q.targetDate]: '2027-03-21',
  [Q.why]: ['race', 'health'],
  [Q.barriers]: ['time'],
  [Q.age]: 34,
  [Q.sex]: 'female',
  [Q.heightCm]: 168,
  [Q.weightKg]: 61,
  [Q.disclaimer]: true,
};

const triathlon: QuizAnswers = {
  [Q.goal]: 'tri_olympic',
  [Q.sports]: ['run', 'bike', 'swim'],
  [S.mode]: 'none',
  [Q.experience]: 'beginner',
  [Q.runReference]: 'easyPace',
  [Q.runEasyPace]: 6 * 60 + 30,
  [Q.bikeHours]: 3,
  [Q.bikePowerMeter]: 'no',
  [Q.swimAbility]: 'comfortable',
  [Q.swimTime400]: 8 * 60,
  [Q.swimTime200]: 3 * 60 + 45,
  [Q.swimWater]: 'pool50',
  [Q.availability]: [45, 60, 45, 60, 0, 150, 90],
  [Q.doubles]: 'yes',
  [Q.terrain]: 'hilly',
  [Q.targetDate]: '2027-06-27',
  [Q.why]: ['challenge'],
  [Q.age]: 41,
  [Q.sex]: 'male',
  [Q.heightCm]: 182,
  [Q.weightKg]: 80,
  [Q.disclaimer]: true,
};

const weightLoss: QuizAnswers = {
  [Q.goal]: 'weightloss',
  [Q.sports]: ['bike'],
  [S.mode]: 'routines',
  [Q.experience]: 'beginner',
  [Q.bikePowerMeter]: 'no',
  [Q.availability]: [30, 0, 30, 0, 30, 60, 0],
  [Q.terrain]: 'flat',
  [Q.why]: ['weight'],
  [Q.note]: '  Feel fit for hiking with my kids ',
  [Q.age]: 45,
  [Q.sex]: 'female',
  [Q.heightCm]: 165,
  [Q.weightKg]: 84,
  [Q.disclaimer]: true,
};

const stepIds = (a: QuizAnswers) => visibleSteps(prepareAnswers(a, TODAY)).map((s) => s.id);

function mapped(a: QuizAnswers): OnboardingResult {
  const r = toPlanInput(a, TODAY);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

describe('baseline step', () => {
  it('is only shown where the surface offers it, right after the level question', () => {
    expect(stepIds(halfMarathon)).not.toContain('baseline');
    const ids = visibleSteps(prepareAnswers(halfMarathon, TODAY), { baseline: true }).map(
      (s) => s.id,
    );
    expect(ids[ids.indexOf('experience') + 1]).toBe('baseline');
    const step = ONBOARDING_STEPS.find((s) => s.id === 'baseline');
    expect(step?.kind).toBe('baseline');
    expect(stepIssues(step as (typeof ONBOARDING_STEPS)[number], halfMarathon, TODAY)).toEqual([]);
  });
});

describe('commute and winter sports', () => {
  it('no commute by default; the details only show for a commute', () => {
    expect(mapped(halfMarathon).profile.commutes).toBeUndefined();
    const ids = (a: QuizAnswers) =>
      stepQuestions(
        ONBOARDING_STEPS.find((s) => s.id === 'commute') as (typeof ONBOARDING_STEPS)[number],
        prepareAnswers(a, TODAY),
      ).map((q) => q.id);
    expect(ids(halfMarathon)).toEqual([Q.commuteSport]);
    expect(ids({ ...halfMarathon, [Q.commuteSport]: 'bike' })).toEqual([
      Q.commuteSport,
      Q.commuteMinutes,
      Q.commuteDays,
      Q.commuteBothWays,
    ]);
  });

  it('maps the commute (defaults: 20 min, workdays, both ways) and the winter sports', () => {
    const bike = mapped({ ...halfMarathon, [Q.commuteSport]: 'bike' });
    expect(bike.profile.commutes).toEqual([
      { id: 'commute-1', sport: 'bike', oneWayMin: 20, weekdays: [0, 1, 2, 3, 4], bothWays: true },
    ]);
    const walk = mapped({
      ...halfMarathon,
      [Q.commuteSport]: 'walk',
      [Q.commuteMinutes]: 35,
      [Q.commuteDays]: ['4', '0'],
      [Q.commuteBothWays]: 'no',
      [Q.winterSports]: ['snowshoe', 'xcski'],
    });
    expect(walk.profile.commutes).toEqual([
      { id: 'commute-1', sport: 'walk', oneWayMin: 35, weekdays: [0, 4], bothWays: false },
    ]);
    expect(walk.profile.winterSports).toEqual(['xcski', 'snowshoe']);
    expect(mapped(halfMarathon).profile.winterSports).toBeUndefined();
  });

  it('maps the longest recent session per selected sport (swims in metres)', () => {
    const tri = mapped({
      ...triathlon,
      [Q.runLongest]: 14,
      [Q.bikeLongest]: 80,
      [Q.swimLongest]: 1500,
    });
    expect(tri.profile.recentLongest).toEqual({
      run: { km: 14 },
      bike: { km: 80 },
      swim: { km: 1.5 },
    });
    // Only for the selected sports, and optional.
    expect(mapped({ ...halfMarathon, [Q.bikeLongest]: 80 }).profile.recentLongest).toBeUndefined();
    expect(stepIds(halfMarathon)).toContain('run');
  });

  it('validates the commute', () => {
    const issues = (a: QuizAnswers) =>
      validateOnboarding(prepareAnswers(a, TODAY), TODAY).map((i) => `${i.questionId}:${i.code}`);
    expect(issues({ ...halfMarathon, [Q.commuteSport]: 'run', [Q.commuteMinutes]: 2 })).toEqual([
      `${Q.commuteMinutes}:outOfRange`,
    ]);
    expect(issues({ ...halfMarathon, [Q.commuteSport]: 'run', [Q.commuteDays]: [] })).toEqual([
      `${Q.commuteDays}:tooFewSelected`,
    ]);
    expect(commuteOf({ [Q.commuteSport]: 'run' })).toBeUndefined();
  });

  it('insights', () => {
    const step = (id: string) =>
      ONBOARDING_STEPS.find((s) => s.id === id) as (typeof ONBOARDING_STEPS)[number];
    const bike = prepareAnswers({ ...halfMarathon, [Q.commuteSport]: 'bike' }, TODAY);
    expect(stepInsight(step('commute'), bike, TODAY)).toEqual({
      key: 'quiz.insights.commute',
      params: { days: 5, hours: 3.3 },
    });
    expect(stepInsight(step('commute'), prepareAnswers(halfMarathon, TODAY), TODAY)).toBeNull();
    expect(stepInsight(step('winter'), halfMarathon, TODAY)).toBeNull();
    expect(
      stepInsight(step('winter'), { ...halfMarathon, [Q.winterSports]: ['xcski'] }, TODAY),
    ).toEqual({ key: 'quiz.insights.winter' });
  });
});

describe('onboarding branching', () => {
  it('shows only the steps that apply', () => {
    expect(stepIds({})).toEqual([
      'goal',
      'sports',
      'strength',
      'experience',
      'heartRate',
      'availability',
      'commute',
      'terrain',
      'winter',
      'motivation',
      'body',
      'disclaimer',
    ]);
    expect(stepIds(halfMarathon)).toEqual([
      'goal',
      'sports',
      'strength',
      'strengthDetails',
      'experience',
      'run',
      'heartRate',
      'availability',
      'commute',
      'terrain',
      'winter',
      'targetDate',
      'motivation',
      'body',
      'disclaimer',
    ]);
    expect(stepIds(triathlon)).toContain('swim');
    expect(stepIds(triathlon)).toContain('bike');
    expect(stepIds(triathlon)).not.toContain('strengthDetails');
    expect(stepIds(weightLoss)).not.toContain('targetDate');
  });

  it('asks the follow-up question that matches the answer', () => {
    const run = (a: QuizAnswers) => {
      const p = prepareAnswers(a, TODAY);
      return Object.keys(p).filter((k) => k.startsWith('run.'));
    };
    expect(run(halfMarathon)).toEqual([Q.runReference, Q.runRaceTime]);
    expect(run(triathlon)).toEqual([Q.runReference, Q.runEasyPace]);
    // Hidden answers are dropped: switching to "no reference" removes the race time.
    expect(run({ ...halfMarathon, [Q.runReference]: 'none' })).toEqual([Q.runReference]);
  });

  it('pre-selects the disciplines a goal needs and keeps chosen ones', () => {
    expect(prepareAnswers({ [Q.goal]: 'tri_sprint' }, TODAY)[Q.sports]).toEqual([
      'run',
      'bike',
      'swim',
    ]);
    expect(prepareAnswers({ [Q.goal]: 'fitness' }, TODAY)[Q.sports]).toBeUndefined();
    const runner = { [Q.goal]: '10k', [Q.sports]: ['run', 'swim'] };
    expect(setAnswer(runner, Q.goal, 'duathlon')[Q.sports]).toEqual(['run', 'bike', 'swim']);
    expect(setAnswer(runner, Q.terrain, 'flat')[Q.sports]).toEqual(['run', 'swim']);
    expect(clearAnswer(runner, Q.sports)).toEqual({ [Q.goal]: '10k' });
  });

  it('uses the race goal for the default strength priority', () => {
    expect(prepareAnswers(halfMarathon, TODAY)[S.priority]).toBe('enduranceFirst');
    expect(prepareAnswers({ ...halfMarathon, [Q.goal]: 'fitness' }, TODAY)[S.priority]).toBe(
      'balanced',
    );
  });
});

describe('onboarding validation', () => {
  const issues = (a: QuizAnswers) =>
    validateOnboarding(prepareAnswers(a, TODAY), TODAY).map((i) => [i.questionId, i.code]);

  it('accepts complete answers', () => {
    expect(issues(halfMarathon)).toEqual([]);
    expect(issues(triathlon)).toEqual([]);
    expect(issues(weightLoss)).toEqual([]);
  });

  it('requires the disciplines of the goal', () => {
    expect(issues({ ...triathlon, [Q.sports]: ['run', 'bike'] })).toEqual([
      [Q.sports, 'goalNeedsSports'],
    ]);
  });

  it('checks heart rate, swim times and race times against each other', () => {
    expect(issues({ ...halfMarathon, [Q.restingHr]: 70, [Q.hrMax]: 65 })).toEqual([
      [Q.hrMax, 'outOfRange'],
    ]);
    expect(issues({ ...halfMarathon, [Q.restingHr]: 110, [Q.hrMax]: 105 })).toEqual([
      [Q.restingHr, 'restingHrNotBelowHrMax'],
    ]);
    expect(issues({ ...triathlon, [Q.swimTime200]: 4 * 60 + 30 })).toEqual([
      [Q.swimTime400, 'swim400NotSlowerThan200'],
    ]);
    // Only one swim time is fine – CSS just stays at the default.
    expect(issues({ ...triathlon, [Q.swimTime200]: undefined })).toEqual([]);
    expect(issues({ ...halfMarathon, [Q.runRaceTime]: 10 * 60 })).toEqual([
      [Q.runRaceTime, 'outOfRange'],
    ]);
  });

  it('needs enough availability, a race date in range and an adult for weight loss', () => {
    expect(issues({ ...halfMarathon, [Q.availability]: [0, 0, 0, 15, 0, 90, 0] })).toEqual([
      [Q.availability, 'notEnoughAvailability'],
    ]);
    expect(issues({ ...halfMarathon, [Q.targetDate]: '2026-10-25' })).toEqual([
      [Q.targetDate, 'outOfRange'],
    ]);
    expect(issues({ ...halfMarathon, [Q.targetDate]: '2027-11-01' })).toEqual([
      [Q.targetDate, 'outOfRange'],
    ]);
    expect(issues({ ...weightLoss, [Q.age]: 16 })).toEqual([[Q.age, 'underageWeightLoss']]);
    expect(issues({ ...halfMarathon, [Q.age]: 16 })).toEqual([]);
  });

  it('requires the disclaimer and reports issues per step', () => {
    expect(issues({ ...halfMarathon, [Q.disclaimer]: undefined })).toEqual([
      [Q.disclaimer, 'mustConfirm'],
    ]);
    const answers = prepareAnswers({ [Q.goal]: 'half' }, TODAY);
    const [goal, sports] = visibleSteps(answers);
    expect(goal && stepIssues(goal, answers, TODAY)).toEqual([]);
    expect(sports && stepIssues(sports, answers, TODAY)).toEqual([]);
    const body = visibleSteps(answers).find((s) => s.id === 'body');
    expect(body && stepIssues(body, answers, TODAY).map((i) => i.code)).toEqual([
      'required',
      'required',
      'required',
      'required',
    ]);
  });
});

describe('insights', () => {
  const insight = (stepId: string, a: QuizAnswers) => {
    const answers = prepareAnswers(a, TODAY);
    const step = visibleSteps(answers).find((s) => s.id === stepId);
    return step ? stepInsight(step, answers, TODAY) : undefined;
  };

  it('personalises with engine numbers', () => {
    expect(insight('goal', triathlon)).toEqual({
      key: 'quiz.insights.goal.triathlon',
      params: { swim: 20, bike: 45, run: 35 },
    });
    expect(insight('goal', halfMarathon)).toEqual({
      key: 'quiz.insights.goal.race',
      params: { weeks: 10 },
    });
    expect(insight('run', halfMarathon)).toEqual({
      key: 'quiz.insights.run.threshold',
      params: { pace: '5:03' },
    });
    expect(insight('run', triathlon)?.key).toBe('quiz.insights.run.thresholdFromEasy');
    expect(insight('swim', triathlon)).toEqual({
      key: 'quiz.insights.swim.css',
      params: { pace: '2:08' },
    });
    expect(insight('availability', halfMarathon)).toEqual({
      key: 'quiz.insights.availability',
      params: { days: 5, hours: 5.5 },
    });
    expect(insight('targetDate', halfMarathon)).toEqual({
      key: 'quiz.insights.targetDate.ok',
      params: { weeks: 22, recommended: 10 },
    });
    expect(insight('targetDate', { ...halfMarathon, [Q.targetDate]: '2026-11-29' })?.key).toBe(
      'quiz.insights.targetDate.short',
    );
    expect(insight('targetDate', { ...halfMarathon, [Q.targetDate]: undefined })).toEqual({
      key: 'quiz.insights.targetDate.none',
      params: { weeks: 12 },
    });
    expect(
      insight('targetDate', { ...halfMarathon, [Q.goal]: 'marathon', [Q.targetDate]: undefined }),
    ).toEqual({ key: 'quiz.insights.targetDate.none', params: { weeks: 14 } });
    expect(insight('motivation', halfMarathon)?.key).toBe('quiz.insights.barriers.time');
    expect(insight('motivation', triathlon)?.key).toBe('quiz.insights.barriers.none');
  });

  it('shows Zone 2 as soon as it can be calculated', () => {
    // Without max HR or age there is nothing to show after the heart-rate step …
    expect(insight('heartRate', { [Q.restingHr]: 52 })).toBeNull();
    // … so it comes after the body step, as an estimate (Karvonen with estimated HRmax).
    expect(insight('body', halfMarathon)).toEqual({
      key: 'quiz.insights.zone2Estimate',
      params: { min: 131, max: 143 },
    });
    expect(insight('heartRate', { [Q.restingHr]: 50, [Q.hrMax]: 190 })).toEqual({
      key: 'quiz.insights.zone2',
      params: { min: 134, max: 147 },
    });
    expect(insight('body', { ...halfMarathon, [Q.hrMax]: 190 })).toBeNull();
    expect(insight('body', weightLoss)).toEqual({
      key: 'quiz.insights.weightloss',
      params: { kg: 0.8 },
    });
  });
});

describe('mapping to plan input', () => {
  it('starts plans on the next Monday', () => {
    expect(planStartDate('2026-10-18')).toBe('2026-10-19');
    expect(planStartDate('2026-10-19')).toBe('2026-10-19');
    expect(planStartDate('2026-10-21')).toBe('2026-10-26');
    expect(() => planStartDate('soon')).toThrow(RangeError);
  });

  it('maps a runner', () => {
    const r = mapped(halfMarathon);
    expect(r.profile).toEqual({
      age: 34,
      experience: 'intermediate',
      sports: ['run'],
      terrain: 'rolling',
      strength: { mode: 'peakr', equipment: 'home', daysPerWeek: 2, priority: 'enduranceFirst' },
      thresholdPaceSecPerKm: 303,
    });
    expect(r.goal).toEqual({ kind: 'half' });
    expect(r.availability).toEqual({
      minutesPerDay: [0, 60, 45, 60, 0, 120, 45],
      doublesAllowed: false,
    });
    expect(r.startDate).toBe('2026-10-19');
    expect(r.targetDate).toBe('2027-03-21');
    expect(r.hrZones).toEqual({ age: 34, restingHr: 52, hrMax: undefined });
    expect(r.body).toEqual({ age: 34, sex: 'female', heightCm: 168, weightKg: 61 });
    expect(r.motivation).toEqual({ why: ['race', 'health'], barriers: ['time'] });
    expect(r.strengthRoutinesPending).toBe(false);
  });

  it('maps a triathlete with swim and bike details', () => {
    const r = mapped(triathlon);
    expect(r.profile).toMatchObject({
      sports: ['run', 'bike', 'swim'],
      poolLength: 50,
      canSwim400m: true,
      cssPacePer100mSec: 128,
      hasPowerMeter: false,
      strength: { mode: 'none' },
    });
    // Easy 6:30/km is the middle of pace zone 2 → threshold ≈ 5:21/km.
    expect(r.profile.thresholdPaceSecPerKm).toBe(321);
    expect(r.availability.doublesAllowed).toBe(true);
    expect(r.bikeHoursPerWeek).toBe(3);
  });

  it('maps swim beginners, open goals and pending routines', () => {
    const beginner = mapped({
      ...triathlon,
      [Q.swimAbility]: 'learning',
      [Q.swimWater]: 'openwater',
    }).profile;
    expect(beginner.canSwim400m).toBe(false);
    expect(beginner.poolLength).toBe('openwater');
    expect(beginner.cssPacePer100mSec).toBeUndefined();

    const r = mapped(weightLoss);
    expect(r.targetDate).toBeUndefined();
    expect(r.profile.strength).toEqual({ mode: 'log' });
    expect(r.strengthRoutinesPending).toBe(true);
    expect(r.motivation.note).toBe('Feel fit for hiking with my kids');
    expect(r.profile.thresholdPaceSecPerKm).toBeUndefined();

    const routines = [{ id: 'r', name: 'Upper', durationMin: 40, exercises: [] }];
    const withRoutine = toPlanInput(weightLoss, TODAY, { routines });
    expect(withRoutine.ok && withRoutine.value.profile.strength.mode).toBe('routines');
  });

  it('maps a race goal without a date to an open plan of the recommended length', () => {
    const answers = { ...halfMarathon, [Q.goal]: 'marathon', [Q.targetDate]: undefined };
    expect(validateOnboarding(prepareAnswers(answers, TODAY), TODAY)).toEqual([]);
    const input = mapped(answers);
    expect(input.targetDate).toBeUndefined();
    const plan = generatePlan(input.profile, input.goal, input.availability, input.startDate);
    if (!plan.ok) throw new Error(JSON.stringify(plan.issues));
    const forecast = buildForecast(plan.value, input, prepareAnswers(answers, TODAY));
    expect(forecast.weeks).toBe(14);
    expect(forecast.phases.at(-1)?.phase).toBe('taper');
    expect(forecast.endDate).toBe('2027-01-24');
    expect(forecast.notes).toEqual([{ key: 'notes.noRaceDate', params: { weeks: 14 } }]);
  });

  it('refuses incomplete answers', () => {
    const r = toPlanInput({ [Q.goal]: 'half' }, TODAY);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues.length).toBeGreaterThan(5);
  });

  it.each([
    ['half marathon', halfMarathon],
    ['triathlon', triathlon],
    ['weight loss', weightLoss],
  ])('generates a plan and forecast for a %s', (_name, answers) => {
    const input = mapped(answers);
    const plan = generatePlan(
      input.profile,
      input.goal,
      input.availability,
      input.startDate,
      input.targetDate,
    );
    if (!plan.ok) throw new Error(JSON.stringify(plan.issues));
    const forecast = buildForecast(plan.value, input, prepareAnswers(answers, TODAY));
    expect(forecast.weeks).toBe(plan.value.weeks.length);
    expect(forecast.phases.reduce((sum, p) => sum + p.weeks, 0)).toBe(forecast.weeks);
    expect(forecast.loads).toHaveLength(forecast.weeks);
    expect(forecast.maxLoad).toBe(Math.max(...plan.value.weeks.map((w) => w.load)));
    expect(plan.value.weeks[0]?.isPartial).toBe(false);
    expect(forecast.outcome[0]?.key).toBe('quiz.forecast.outcome.volume');
  });
});

describe('forecast', () => {
  function forecastFor(answers: QuizAnswers) {
    const input = mapped(answers);
    const plan = generatePlan(
      input.profile,
      input.goal,
      input.availability,
      input.startDate,
      input.targetDate,
    );
    if (!plan.ok) throw new Error(JSON.stringify(plan.issues));
    return buildForecast(plan.value, input, prepareAnswers(answers, TODAY));
  }

  it('runs from the start Monday to race day through all phases', () => {
    const f = forecastFor(halfMarathon);
    expect(f.startDate).toBe('2026-10-19');
    expect(f.endDate).toBe('2027-03-21');
    expect(f.phases.map((p) => p.phase)).toEqual(['base', 'build', 'peak', 'taper']);
    expect(f.recoveryWeeks).toBeGreaterThan(0);
    expect(f.sessions).toBeGreaterThan(f.weeks * 3);
  });

  it('predicts the race time from the entered race (Riegel), never an invented improvement', () => {
    const keys = forecastFor(halfMarathon).outcome.map((o) => o.key);
    expect(keys).toEqual([
      'quiz.forecast.outcome.volume',
      'quiz.forecast.outcome.racePrediction',
      'quiz.forecast.outcome.easyShare',
    ]);
    const prediction = forecastFor(halfMarathon).outcome[1];
    // 10 km in 50:00 → half marathon 1:50:19 (Riegel exponent 1.06).
    expect(prediction?.params).toEqual({ time: '1:50:19', reference: '10k', distance: 'half' });
    expect(
      forecastFor({ ...halfMarathon, [Q.runReference]: 'half', [Q.runRaceTime]: 6000 }).outcome[1]
        ?.key,
    ).toBe('quiz.forecast.outcome.raceCurrent');
  });

  it('adds multisport, swim and weight-loss lines where they apply', () => {
    const tri = forecastFor(triathlon).outcome.map((o) => o.key);
    expect(tri).toContain('quiz.forecast.outcome.threshold');
    expect(tri).toContain('quiz.forecast.outcome.css');
    expect(tri).toContain('quiz.forecast.outcome.oneLoad');
    const loss = forecastFor(weightLoss);
    expect(loss.endDate).toBe('2027-01-10');
    expect(loss.outcome.map((o) => o.key)).toEqual([
      'quiz.forecast.outcome.volume',
      'quiz.forecast.outcome.easyShare',
      'quiz.forecast.outcome.weightloss',
      'quiz.forecast.outcome.routinesPending',
    ]);
  });
});
