import {
  analyzeRaceResult,
  calculateCss,
  calculateHrZones,
  prescriptionBands,
  COMMUTE_SPORTS,
  formatDuration,
  isRaceGoal,
  planConfig,
  realisticRaceTimeRange,
  requiredSports,
  SPORTS,
  suggestedSessions,
  thresholdFromEasyPace,
  zoneConfig,
  type Availability,
  type Commute,
  type CommuteSport,
  type CustomExercise,
  type Experience,
  type GoalKind,
  type HrZoneInput,
  type PoolLength,
  type ReferenceRaceId,
  type Routine,
  type Sport,
  type StrengthSetup,
  type Terrain,
  type UserProfile,
  type Weekday,
  type WinterSport,
} from '@peakr/engine';

import {
  dayToIso,
  isoToDay,
  validateAnswers,
  visibleQuestions,
  withDefaults,
  type QuizAnswers,
  type QuizAnswerValue,
  type QuizContext,
  type QuizIssue,
  type QuizOption,
  type QuizQuestion,
} from './model';
import { STRENGTH_QUESTION_IDS, strengthQuestions, toStrengthSetup } from './strength';

/**
 * The onboarding quiz (CLAUDE.md "Two surfaces, one account"): every question, its branching and
 * validation, the steps (one screen each), the insights shown between steps and the mapping of the
 * answers to `generatePlan` input. Web and app render exactly this.
 */

export const GOALS: readonly GoalKind[] = [
  '5k',
  '10k',
  'half',
  'marathon',
  'fitness',
  'weightloss',
  'granfondo',
  'swim',
  'tri_sprint',
  'tri_olympic',
  'tri_70_3',
  'tri_full',
  'duathlon',
];
export const EXPERIENCES: readonly Experience[] = ['beginner', 'intermediate', 'advanced'];
export const TERRAINS: readonly Terrain[] = ['flat', 'rolling', 'hilly', 'mountainous'];
export const RUN_REFERENCES = ['5k', '10k', 'half', 'easyPace', 'none'] as const;
export const SWIM_ABILITIES = ['learning', 'can100', 'comfortable'] as const;
export const SWIM_WATERS = ['pool25', 'pool50', 'openwater'] as const;
export const SEXES = ['female', 'male'] as const;
export const MOTIVATIONS = ['health', 'weight', 'race', 'energy', 'challenge', 'stress'] as const;
export const BARRIERS = ['time', 'motivation', 'injury', 'knowledge', 'rigid', 'boredom'] as const;
export const COMMUTE_OPTIONS = ['none', ...COMMUTE_SPORTS] as const;
export const WINTER_SPORTS: readonly WinterSport[] = ['xcski', 'skitour', 'snowshoe'];
export const WEEKDAY_VALUES = ['0', '1', '2', '3', '4', '5', '6'] as const;

export type RunReference = (typeof RUN_REFERENCES)[number];
export type SwimAbility = (typeof SWIM_ABILITIES)[number];
export type Sex = (typeof SEXES)[number];

export const QUESTION_IDS = {
  goal: 'goal',
  sports: 'sports',
  experience: 'experience',
  runReference: 'run.reference',
  runRaceTime: 'run.raceTime',
  runEasyPace: 'run.easyPace',
  bikeHours: 'bike.hoursPerWeek',
  runLongest: 'run.longest',
  bikeLongest: 'bike.longest',
  swimLongest: 'swim.longest',
  bikePowerMeter: 'bike.powerMeter',
  swimAbility: 'swim.ability',
  swimTime400: 'swim.time400',
  swimTime200: 'swim.time200',
  swimWater: 'swim.water',
  restingHr: 'hr.resting',
  hrMax: 'hr.max',
  sessionsMode: 'sessions.mode',
  runSessions: 'run.sessions',
  bikeSessions: 'bike.sessions',
  swimSessions: 'swim.sessions',
  availability: 'availability.minutes',
  doubles: 'availability.doubles',
  commuteSport: 'commute.sport',
  commuteMinutes: 'commute.minutes',
  commuteDays: 'commute.days',
  commuteBothWays: 'commute.bothWays',
  terrain: 'terrain',
  winterSports: 'winter.sports',
  targetDate: 'targetDate',
  why: 'motivation.why',
  barriers: 'motivation.barriers',
  note: 'motivation.note',
  age: 'body.age',
  sex: 'body.sex',
  heightCm: 'body.heightCm',
  weightKg: 'body.weightKg',
  disclaimer: 'disclaimer',
} as const;

const Q = QUESTION_IDS;
const hrLimits = zoneConfig.hr.limits;
const swimLimits = zoneConfig.swim.limits;

/** Sessions per week and discipline the user can ask for. */
const SESSIONS_RANGE = { min: 1, max: 7 };
const SESSIONS_ID = { run: Q.runSessions, bike: Q.bikeSessions, swim: Q.swimSessions } as const;

/** Easy pace entry: 3:30–12:00 per km. */
const EASY_PACE_RANGE = { min: 210, max: 720 };
const BIKE_HOURS_RANGE = { min: 0, max: 25 };
/** Longest session of the last weeks: km for run and bike, metres for swims. */
const LONGEST_RANGE = {
  run: { min: 1, max: 60 },
  bike: { min: 5, max: 400 },
  swim: { min: 100, max: 10_000 },
} as const;
const HEIGHT_RANGE = { min: 120, max: 230 };
const WEIGHT_RANGE = { min: 30, max: 250 };
const NOTE_MAX_LENGTH = 500;
/** Race at least two weeks away; the engine allows plans up to `maxWeeks` from the start week. */
const TARGET_DAYS = { min: 14, max: planConfig.plan.maxWeeks * 7 - 7 };
/** Suggested availability: two short weekday sessions and a longer weekend one. */
const DEFAULT_MINUTES = [0, 45, 0, 45, 0, 90, 60] as const;
/** Commutes on workdays by default. */
const DEFAULT_COMMUTE_DAYS = ['0', '1', '2', '3', '4'] as const;

function options(id: string, values: readonly string[], withDescription = false): QuizOption[] {
  return values.map((value) => ({
    value,
    labelKey: `quiz.${id}.options.${value}.label`,
    ...(withDescription ? { descriptionKey: `quiz.${id}.options.${value}.description` } : {}),
  }));
}

const YES_NO: QuizOption[] = [
  { value: 'yes', labelKey: 'common.yes' },
  { value: 'no', labelKey: 'common.no' },
];

// ---------------------------------------------------------------------------------------------
// Typed access to answers

const str = (a: QuizAnswers, id: string) =>
  typeof a[id] === 'string' ? (a[id] as string) : undefined;
const num = (a: QuizAnswers, id: string) =>
  typeof a[id] === 'number' ? (a[id] as number) : undefined;

export function goalOf(a: QuizAnswers): GoalKind | undefined {
  const g = str(a, Q.goal);
  return GOALS.includes(g as GoalKind) ? (g as GoalKind) : undefined;
}

export function sportsOf(a: QuizAnswers): Sport[] {
  const s = a[Q.sports];
  return Array.isArray(s)
    ? SPORTS.filter((sport) => (s as readonly unknown[]).includes(sport))
    : [];
}

const has = (sport: Sport) => (a: QuizAnswers) => sportsOf(a).includes(sport);
const ownSessions = (a: QuizAnswers) => str(a, Q.sessionsMode) === 'own';

/** What Peakr plans per discipline for these answers when the user leaves it open. */
export function sessionSuggestion(a: QuizAnswers): Record<Sport, number> {
  const goal = goalOf(a) ?? 'fitness';
  const experience = (str(a, Q.experience) as Experience | undefined) ?? 'beginner';
  return suggestedSessions(goal, {
    age: 35,
    experience,
    sports: sportsOf(a).length > 0 ? sportsOf(a) : ['run'],
    terrain: 'flat',
    strength: { mode: 'none' },
  });
}

/** The sessions per week the user chose (own numbers only; Peakr's suggestion is not stored). */
export function sessionsOf(a: QuizAnswers): Partial<Record<Sport, number>> | undefined {
  if (!ownSessions(a)) return undefined;
  const out: Partial<Record<Sport, number>> = {};
  for (const sport of sportsOf(a)) {
    const n = num(a, SESSIONS_ID[sport]);
    if (n !== undefined) out[sport] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
const raceReference = (a: QuizAnswers): ReferenceRaceId | undefined => {
  const r = str(a, Q.runReference);
  return r === '5k' || r === '10k' || r === 'half' ? r : undefined;
};
const swimsComfortably = (a: QuizAnswers) =>
  has('swim')(a) && str(a, Q.swimAbility) === 'comfortable';
const commutes = (a: QuizAnswers) => {
  const sport = str(a, Q.commuteSport);
  return sport !== undefined && sport !== 'none';
};
const isRace = (a: QuizAnswers) => {
  const goal = goalOf(a);
  return goal !== undefined && isRaceGoal(goal);
};

export function onboardingContext(answers: QuizAnswers, today: string): QuizContext {
  return { raceGoal: isRace(answers), today };
}

// ---------------------------------------------------------------------------------------------
// Questions

export const onboardingQuestions: readonly QuizQuestion[] = [
  {
    id: Q.goal,
    kind: 'single',
    titleKey: 'quiz.goal.title',
    options: options('goal', GOALS, true),
  },
  {
    id: Q.sports,
    kind: 'multi',
    titleKey: 'quiz.sports.title',
    hintKey: 'quiz.sports.hint',
    options: options('sports', SPORTS),
    minSelected: 1,
    defaultValue: (a) => {
      const goal = goalOf(a);
      const required = goal ? requiredSports(goal) : [];
      return required.length > 0 ? SPORTS.filter((s) => required.includes(s)) : undefined;
    },
    check: (a) => {
      const goal = goalOf(a);
      const missing = goal ? requiredSports(goal).filter((s) => !sportsOf(a).includes(s)) : [];
      return missing.length > 0 ? [{ questionId: Q.sports, code: 'goalNeedsSports' }] : [];
    },
  },
  ...strengthQuestions,
  {
    id: Q.experience,
    kind: 'single',
    titleKey: 'quiz.experience.title',
    options: options('experience', EXPERIENCES, true),
  },
  {
    id: Q.runReference,
    kind: 'single',
    titleKey: 'quiz.run.reference.title',
    hintKey: 'quiz.run.reference.hint',
    options: options('run.reference', RUN_REFERENCES),
    visibleIf: has('run'),
  },
  {
    id: Q.runRaceTime,
    kind: 'duration',
    titleKey: 'quiz.run.raceTime.title',
    withHours: true,
    range: (a) => realisticRaceTimeRange(raceReference(a) ?? '5k'),
    visibleIf: (a) => has('run')(a) && raceReference(a) !== undefined,
  },
  {
    id: Q.runEasyPace,
    kind: 'duration',
    titleKey: 'quiz.run.easyPace.title',
    hintKey: 'quiz.run.easyPace.hint',
    unitKey: 'units.perKm',
    range: () => EASY_PACE_RANGE,
    visibleIf: (a) => has('run')(a) && str(a, Q.runReference) === 'easyPace',
  },
  {
    id: Q.bikeHours,
    kind: 'number',
    titleKey: 'quiz.bike.hoursPerWeek.title',
    hintKey: 'quiz.bike.hoursPerWeek.hint',
    unitKey: 'quiz.bike.hoursPerWeek.unit',
    range: () => BIKE_HOURS_RANGE,
    defaultValue: () => 2,
    visibleIf: has('bike'),
  },
  ...(['run', 'bike', 'swim'] as const).map((sport): QuizQuestion => ({
    id: { run: Q.runLongest, bike: Q.bikeLongest, swim: Q.swimLongest }[sport],
    kind: 'number',
    titleKey: `quiz.${sport}.longest.title`,
    hintKey: `quiz.${sport}.longest.hint`,
    unitKey: `quiz.${sport}.longest.unit`,
    optional: true,
    range: () => LONGEST_RANGE[sport],
    visibleIf: has(sport),
  })),
  {
    id: Q.bikePowerMeter,
    kind: 'single',
    titleKey: 'quiz.bike.powerMeter.title',
    options: YES_NO,
    visibleIf: has('bike'),
  },
  {
    id: Q.swimAbility,
    kind: 'single',
    titleKey: 'quiz.swim.ability.title',
    options: options('swim.ability', SWIM_ABILITIES, true),
    visibleIf: has('swim'),
  },
  {
    id: Q.swimTime400,
    kind: 'duration',
    titleKey: 'quiz.swim.time400.title',
    hintKey: 'quiz.swim.time400.hint',
    optional: true,
    range: () => swimLimits.time400Sec,
    visibleIf: swimsComfortably,
  },
  {
    id: Q.swimTime200,
    kind: 'duration',
    titleKey: 'quiz.swim.time200.title',
    hintKey: 'quiz.swim.time200.hint',
    optional: true,
    range: () => swimLimits.time200Sec,
    visibleIf: swimsComfortably,
    check: (a) => {
      const r = calculateCss({
        time400Sec: num(a, Q.swimTime400),
        time200Sec: num(a, Q.swimTime200),
      });
      if (r.ok) return [];
      return r.issues
        .filter((i) => i.code !== 'required' && i.code !== 'outOfRange')
        .map((i) => ({ questionId: Q.swimTime400, code: i.code, params: i.params }));
    },
  },
  {
    id: Q.swimWater,
    kind: 'single',
    titleKey: 'quiz.swim.water.title',
    options: options('swim.water', SWIM_WATERS),
    visibleIf: has('swim'),
  },
  {
    id: Q.restingHr,
    kind: 'number',
    titleKey: 'quiz.hr.resting.title',
    hintKey: 'quiz.hr.resting.hint',
    unitKey: 'units.bpm',
    optional: true,
    range: () => hrLimits.restingHr,
  },
  {
    id: Q.hrMax,
    kind: 'number',
    titleKey: 'quiz.hr.max.title',
    hintKey: 'quiz.hr.max.hint',
    unitKey: 'units.bpm',
    optional: true,
    range: () => hrLimits.hrMax,
    check: (a) => {
      const resting = num(a, Q.restingHr);
      const max = num(a, Q.hrMax);
      return resting !== undefined && max !== undefined && resting >= max
        ? [{ questionId: Q.restingHr, code: 'restingHrNotBelowHrMax', params: { hrMax: max } }]
        : [];
    },
  },
  {
    id: Q.sessionsMode,
    kind: 'single',
    titleKey: 'quiz.sessions.mode.title',
    hintKey: 'quiz.sessions.mode.hint',
    options: options('sessions.mode', ['suggest', 'own'], true),
    defaultValue: () => 'suggest',
    visibleIf: (a) => sportsOf(a).length > 0,
  },
  ...SPORTS.map((sport): QuizQuestion => ({
    id: SESSIONS_ID[sport],
    kind: 'number',
    titleKey: `quiz.sessions.${sport}.title`,
    unitKey: 'quiz.sessions.unit',
    range: () => SESSIONS_RANGE,
    // Starts at Peakr's suggestion, so "own" means changing it, not entering it from scratch.
    defaultValue: (a) => Math.max(SESSIONS_RANGE.min, sessionSuggestion(a)[sport]),
    visibleIf: (a) => has(sport)(a) && ownSessions(a),
  })),
  {
    id: Q.availability,
    kind: 'weekMinutes',
    titleKey: 'quiz.availability.title',
    hintKey: 'quiz.availability.hint',
    range: { min: 0, max: planConfig.plan.maxMinutesPerDay, step: 15 },
    defaultValue: () => DEFAULT_MINUTES,
    check: (a) => {
      const minutes = a[Q.availability] as readonly number[];
      const { minSessionMin, minTrainingDays } = planConfig.plan;
      const days = minutes.filter((m) => m >= minSessionMin).length;
      if (days < minTrainingDays) {
        return [
          {
            questionId: Q.availability,
            code: 'notEnoughAvailability',
            params: { days: minTrainingDays, minutes: minSessionMin },
          },
        ];
      }
      // The sessions the user asked for need a day each (unless two a day are allowed).
      const sessions = Object.values(sessionsOf(a) ?? {}).reduce((s, n) => s + n, 0);
      return sessions > days && str(a, Q.doubles) !== 'yes'
        ? [
            {
              questionId: Q.availability,
              code: 'notEnoughDaysForSessions',
              params: { days, sessions },
            },
          ]
        : [];
    },
  },
  {
    id: Q.doubles,
    kind: 'single',
    titleKey: 'quiz.availability.doubles.title',
    hintKey: 'quiz.availability.doubles.hint',
    options: YES_NO,
    defaultValue: () => 'no',
    visibleIf: (a) => sportsOf(a).length > 1,
  },
  {
    id: Q.commuteSport,
    kind: 'single',
    titleKey: 'quiz.commute.sport.title',
    hintKey: 'quiz.commute.sport.hint',
    options: options('commute.sport', COMMUTE_OPTIONS),
    defaultValue: () => 'none',
  },
  {
    id: Q.commuteMinutes,
    kind: 'number',
    titleKey: 'quiz.commute.minutes.title',
    hintKey: 'quiz.commute.minutes.hint',
    unitKey: 'units.min',
    range: () => planConfig.commute.oneWayMin,
    defaultValue: () => 20,
    visibleIf: commutes,
  },
  {
    id: Q.commuteDays,
    kind: 'multi',
    titleKey: 'quiz.commute.days.title',
    options: WEEKDAY_VALUES.map((d) => ({ value: d, labelKey: `quiz.availability.weekdays.${d}` })),
    minSelected: 1,
    defaultValue: () => DEFAULT_COMMUTE_DAYS,
    visibleIf: commutes,
  },
  {
    id: Q.commuteBothWays,
    kind: 'single',
    titleKey: 'quiz.commute.bothWays.title',
    options: YES_NO,
    defaultValue: () => 'yes',
    visibleIf: commutes,
  },
  {
    id: Q.terrain,
    kind: 'single',
    titleKey: 'quiz.terrain.title',
    options: options('terrain', TERRAINS, true),
  },
  {
    id: Q.winterSports,
    kind: 'multi',
    titleKey: 'quiz.winter.sports.title',
    hintKey: 'quiz.winter.sports.hint',
    options: options('winter.sports', WINTER_SPORTS),
    minSelected: 0,
    optional: true,
  },
  {
    id: Q.targetDate,
    kind: 'date',
    titleKey: 'quiz.targetDate.title',
    hintKey: 'quiz.targetDate.hint',
    // No date yet: the plan gets the recommended preparation length.
    optional: true,
    rangeDays: TARGET_DAYS,
    visibleIf: isRace,
  },
  {
    id: Q.why,
    kind: 'multi',
    titleKey: 'quiz.motivation.why.title',
    options: options('motivation.why', MOTIVATIONS),
    minSelected: 1,
  },
  {
    id: Q.barriers,
    kind: 'multi',
    titleKey: 'quiz.motivation.barriers.title',
    options: options('motivation.barriers', BARRIERS),
    minSelected: 0,
    optional: true,
  },
  {
    id: Q.note,
    kind: 'text',
    titleKey: 'quiz.motivation.note.title',
    hintKey: 'quiz.motivation.note.hint',
    maxLength: NOTE_MAX_LENGTH,
    optional: true,
  },
  {
    id: Q.age,
    kind: 'number',
    titleKey: 'quiz.body.age.title',
    unitKey: 'units.years',
    range: () => hrLimits.age,
    check: (a) => {
      const age = num(a, Q.age);
      const min = planConfig.plan.weightLossMinAge;
      return goalOf(a) === 'weightloss' && age !== undefined && age < min
        ? [{ questionId: Q.age, code: 'underageWeightLoss', params: { min } }]
        : [];
    },
  },
  {
    id: Q.sex,
    kind: 'single',
    titleKey: 'quiz.body.sex.title',
    hintKey: 'quiz.body.sex.hint',
    options: options('body.sex', SEXES),
  },
  {
    id: Q.heightCm,
    kind: 'number',
    titleKey: 'quiz.body.heightCm.title',
    unitKey: 'units.cm',
    range: () => HEIGHT_RANGE,
  },
  {
    id: Q.weightKg,
    kind: 'number',
    titleKey: 'quiz.body.weightKg.title',
    unitKey: 'units.kg',
    range: () => WEIGHT_RANGE,
  },
  {
    id: Q.disclaimer,
    kind: 'confirm',
    titleKey: 'quiz.disclaimer.title',
    hintKey: 'quiz.disclaimer.text',
    labelKey: 'quiz.disclaimer.confirm',
  },
];

// ---------------------------------------------------------------------------------------------
// Steps and insights

/** Shown between steps; params are already formatted. */
export interface QuizInsight {
  key: string;
  params?: Readonly<Record<string, string | number>>;
}

export interface QuizStep {
  id: string;
  /**
   * `baseline`: the optional "make my plan more accurate" step (Strava calibration, CLAUDE.md
   * "Baseline from past activities"). It asks no question; each surface renders its own UI and may
   * leave it out (the website offers it after sign-up instead).
   */
  kind?: 'questions' | 'baseline';
  /** Questions on this screen (hidden ones are skipped; a step without visible ones too). */
  questionIds: readonly string[];
  /** Personalised insight shown after the step, if there is something to say. */
  insight?: (answers: QuizAnswers, ctx: QuizContext) => QuizInsight | null;
}

const S = STRENGTH_QUESTION_IDS;

/** Zone 2 of the default method for what we know so far; null without age and max HR. */
export function zone2Range(
  answers: QuizAnswers,
): { min: number; max: number; estimate: boolean } | null {
  const input: HrZoneInput = {
    age: num(answers, Q.age),
    restingHr: num(answers, Q.restingHr),
    hrMax: num(answers, Q.hrMax),
  };
  // Validated like the zone table, but the numbers are the easy band the sessions prescribe.
  const r = calculateHrZones(input);
  if (!r.ok) return null;
  const easy = prescriptionBands({
    ...(input.age !== undefined ? { age: input.age } : {}),
    ...(input.restingHr !== undefined ? { restingHr: input.restingHr } : {}),
    ...(input.hrMax !== undefined ? { hrMax: input.hrMax } : {}),
  }).find((z) => z.zone === 2);
  if (!easy) return null;
  return {
    min: easy.minBpm as number,
    max: easy.maxBpm as number,
    estimate: r.value.hrMaxIsEstimate,
  };
}

function zone2Insight(answers: QuizAnswers): QuizInsight | null {
  const z2 = zone2Range(answers);
  if (!z2) return null;
  return {
    key: z2.estimate ? 'quiz.insights.zone2Estimate' : 'quiz.insights.zone2',
    params: { min: z2.min, max: z2.max },
  };
}

function goalInsight(a: QuizAnswers): QuizInsight | null {
  const goal = goalOf(a);
  if (!goal) return null;
  if (goal.startsWith('tri_')) {
    const split = planConfig.multisport.split.tri;
    return {
      key: 'quiz.insights.goal.triathlon',
      params: {
        swim: Math.round(split.swim * 100),
        bike: Math.round(split.bike * 100),
        run: Math.round(split.run * 100),
      },
    };
  }
  if (isRaceGoal(goal)) {
    return {
      key: 'quiz.insights.goal.race',
      params: { weeks: planConfig.plan.minRaceWeeks[goal] },
    };
  }
  return {
    key: goal === 'weightloss' ? 'quiz.insights.goal.weightloss' : 'quiz.insights.goal.fitness',
  };
}

function runInsight(a: QuizAnswers): QuizInsight | null {
  const threshold = thresholdPaceOf(a);
  if (threshold === undefined) return { key: 'quiz.insights.run.noReference' };
  return {
    key: raceReference(a) ? 'quiz.insights.run.threshold' : 'quiz.insights.run.thresholdFromEasy',
    params: { pace: formatDuration(threshold) },
  };
}

function swimInsight(a: QuizAnswers): QuizInsight | null {
  const css = cssPaceOf(a);
  if (css !== undefined)
    return { key: 'quiz.insights.swim.css', params: { pace: formatDuration(css) } };
  return str(a, Q.swimAbility) === 'comfortable'
    ? { key: 'quiz.insights.swim.noTimes' }
    : { key: 'quiz.insights.swim.technique' };
}

/** "Peakr plans 4 runs and 2 rides a week" – the suggestion or the user's own numbers. */
function sessionsInsight(a: QuizAnswers): QuizInsight | null {
  const sports = sportsOf(a);
  if (sports.length === 0) return null;
  const counts = { ...sessionSuggestion(a), ...(sessionsOf(a) ?? {}) };
  const params: Record<string, number> = {};
  for (const sport of sports) params[sport] = counts[sport];
  return { key: `quiz.insights.sessions.${sports.join('_')}`, params };
}

function availabilityInsight(a: QuizAnswers): QuizInsight | null {
  const minutes = (a[Q.availability] as readonly number[] | undefined) ?? [];
  const days = minutes.filter((m) => m >= planConfig.plan.minSessionMin).length;
  const total = minutes.reduce((sum, m) => sum + m, 0);
  return { key: 'quiz.insights.availability', params: { days, hours: Math.round(total / 6) / 10 } };
}

function commuteInsight(a: QuizAnswers): QuizInsight | null {
  const commute = commuteOf(a);
  if (!commute) return null;
  const minutes = commute.oneWayMin * (commute.bothWays ? 2 : 1) * commute.weekdays.length;
  return {
    key: 'quiz.insights.commute',
    params: { days: commute.weekdays.length, hours: Math.round(minutes / 6) / 10 },
  };
}

function winterInsight(a: QuizAnswers): QuizInsight | null {
  return winterSportsOf(a).length > 0 ? { key: 'quiz.insights.winter' } : null;
}

function targetDateInsight(a: QuizAnswers, ctx: QuizContext): QuizInsight | null {
  const goal = goalOf(a);
  if (!goal || !isRaceGoal(goal)) return null;
  const recommended = planConfig.plan.minRaceWeeks[goal];
  const weeks = weeksUntil(str(a, Q.targetDate), ctx.today);
  if (weeks === null) {
    // Same length the engine uses without a date.
    const planWeeks = Math.max(planConfig.plan.defaultWeeks, recommended);
    return { key: 'quiz.insights.targetDate.none', params: { weeks: planWeeks } };
  }
  return {
    key: weeks < recommended ? 'quiz.insights.targetDate.short' : 'quiz.insights.targetDate.ok',
    params: { weeks, recommended },
  };
}

function motivationInsight(a: QuizAnswers): QuizInsight | null {
  const barriers = (a[Q.barriers] as readonly string[] | undefined) ?? [];
  const first = BARRIERS.find((b) => barriers.includes(b));
  return { key: `quiz.insights.barriers.${first ?? 'none'}` };
}

function bodyInsight(a: QuizAnswers): QuizInsight | null {
  const weight = num(a, Q.weightKg);
  if (goalOf(a) === 'weightloss' && weight !== undefined) {
    return {
      key: 'quiz.insights.weightloss',
      params: { kg: Math.round(weight * MAX_LOSS_PER_WEEK * 10) / 10 },
    };
  }
  // The Zone 2 insight after the heart-rate step needs a max HR; without one it comes here.
  return num(a, Q.hrMax) === undefined ? zone2Insight(a) : null;
}

/** CLAUDE.md safety rule: at most 1 % of body weight per week. */
export const MAX_LOSS_PER_WEEK = 0.01;

export const ONBOARDING_STEPS: readonly QuizStep[] = [
  { id: 'goal', questionIds: [Q.goal], insight: goalInsight },
  { id: 'sports', questionIds: [Q.sports] },
  { id: 'strength', questionIds: [S.mode] },
  { id: 'strengthDetails', questionIds: [S.split, S.equipment, S.daysPerWeek, S.priority] },
  { id: 'experience', questionIds: [Q.experience] },
  { id: 'baseline', kind: 'baseline', questionIds: [] },
  {
    id: 'run',
    questionIds: [Q.runReference, Q.runRaceTime, Q.runEasyPace, Q.runLongest],
    insight: runInsight,
  },
  { id: 'bike', questionIds: [Q.bikeHours, Q.bikeLongest, Q.bikePowerMeter] },
  {
    id: 'swim',
    questionIds: [Q.swimAbility, Q.swimTime400, Q.swimTime200, Q.swimLongest, Q.swimWater],
    insight: swimInsight,
  },
  { id: 'heartRate', questionIds: [Q.restingHr, Q.hrMax], insight: zone2Insight },
  {
    id: 'sessions',
    questionIds: [Q.sessionsMode, Q.runSessions, Q.bikeSessions, Q.swimSessions],
    insight: sessionsInsight,
  },
  { id: 'availability', questionIds: [Q.availability, Q.doubles], insight: availabilityInsight },
  {
    id: 'commute',
    questionIds: [Q.commuteSport, Q.commuteMinutes, Q.commuteDays, Q.commuteBothWays],
    insight: commuteInsight,
  },
  { id: 'terrain', questionIds: [Q.terrain] },
  { id: 'winter', questionIds: [Q.winterSports], insight: winterInsight },
  { id: 'targetDate', questionIds: [Q.targetDate], insight: targetDateInsight },
  { id: 'motivation', questionIds: [Q.why, Q.barriers, Q.note], insight: motivationInsight },
  { id: 'body', questionIds: [Q.age, Q.sex, Q.heightCm, Q.weightKg], insight: bodyInsight },
  { id: 'disclaimer', questionIds: [Q.disclaimer] },
];

const byId = new Map(onboardingQuestions.map((q) => [q.id, q]));

/** Visible questions of one step, in order. */
export function stepQuestions(step: QuizStep, answers: QuizAnswers): QuizQuestion[] {
  return visibleQuestions(
    step.questionIds.map((id) => byId.get(id)).filter((q): q is QuizQuestion => q !== undefined),
    answers,
  );
}

/** Steps the user sees for the current answers. */
export function visibleSteps(
  answers: QuizAnswers,
  options: { baseline?: boolean } = {},
): QuizStep[] {
  return ONBOARDING_STEPS.filter((s) =>
    s.kind === 'baseline' ? options.baseline === true : stepQuestions(s, answers).length > 0,
  );
}

/** Answers with defaults (and without answers to hidden questions). */
export function prepareAnswers(given: QuizAnswers, today: string): QuizAnswers {
  return withDefaults(onboardingQuestions, given, onboardingContext(given, today));
}

/**
 * Sets one answer. Changing the goal pre-selects the disciplines it needs (triathlon: all three)
 * while keeping the ones already chosen.
 */
export function setAnswer(given: QuizAnswers, id: string, value: QuizAnswerValue): QuizAnswers {
  const next: Record<string, QuizAnswerValue> = { ...(given as Record<string, QuizAnswerValue>) };
  next[id] = value;
  if (id === Q.goal && next[Q.sports] !== undefined) {
    const required = requiredSports(value as GoalKind);
    const chosen = sportsOf(next);
    next[Q.sports] = SPORTS.filter((s) => chosen.includes(s) || required.includes(s));
  }
  return next;
}

/** Clears an answer (optional fields the user emptied). */
export function clearAnswer(given: QuizAnswers, id: string): QuizAnswers {
  return Object.fromEntries(Object.entries(given).filter(([key]) => key !== id));
}

export function validateOnboarding(answers: QuizAnswers, today: string): QuizIssue[] {
  return validateAnswers(onboardingQuestions, answers, onboardingContext(answers, today));
}

/** Issues on the questions of one step (cross-field issues land on the question they name). */
export function stepIssues(step: QuizStep, answers: QuizAnswers, today: string): QuizIssue[] {
  const ids = new Set(stepQuestions(step, answers).map((q) => q.id));
  return validateOnboarding(answers, today).filter((i) => ids.has(i.questionId));
}

export function stepInsight(
  step: QuizStep,
  answers: QuizAnswers,
  today: string,
): QuizInsight | null {
  return step.insight?.(answers, onboardingContext(answers, today)) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Answers → plan input

/** Threshold pace from a race result, or estimated from the easy pace (middle of pace zone 2). */
export function thresholdPaceOf(a: QuizAnswers): number | undefined {
  if (!has('run')(a)) return undefined;
  const race = raceReference(a);
  const raceTime = num(a, Q.runRaceTime);
  if (race && raceTime !== undefined) {
    const r = analyzeRaceResult({ distance: race, timeSec: raceTime });
    return r.ok ? r.value.thresholdPaceSecPerKm : undefined;
  }
  const easy = num(a, Q.runEasyPace);
  if (str(a, Q.runReference) === 'easyPace' && easy !== undefined) {
    return thresholdFromEasyPace(easy);
  }
  return undefined;
}

export function cssPaceOf(a: QuizAnswers): number | undefined {
  if (!swimsComfortably(a)) return undefined;
  const r = calculateCss({ time400Sec: num(a, Q.swimTime400), time200Sec: num(a, Q.swimTime200) });
  return r.ok ? r.value.cssPacePer100mSec : undefined;
}

function weeksUntil(iso: string | undefined, today: string | undefined): number | null {
  const target = iso === undefined ? null : isoToDay(iso);
  const now = today === undefined ? null : isoToDay(today);
  return target === null || now === null ? null : Math.floor((target - now) / 7);
}

/** Plans start on Monday: today if it is one, else next Monday – so week 1 is a full week. */
export function planStartDate(today: string): string {
  const day = isoToDay(today);
  if (day === null) throw new RangeError(`invalid date ${today}`);
  // 1970-01-01 was a Thursday (weekday 3 with Monday = 0).
  const weekday = (day + 3) % 7;
  return dayToIso(weekday === 0 ? day : day + 7 - weekday);
}

/** The commute from the quiz (one; more can be added in the app). */
export function commuteOf(a: QuizAnswers): Commute | undefined {
  if (!commutes(a)) return undefined;
  const days = (a[Q.commuteDays] as readonly string[] | undefined) ?? [];
  const oneWayMin = num(a, Q.commuteMinutes);
  if (oneWayMin === undefined || days.length === 0) return undefined;
  return {
    id: 'commute-1',
    sport: str(a, Q.commuteSport) as CommuteSport,
    oneWayMin,
    weekdays: WEEKDAY_VALUES.filter((d) => days.includes(d)).map((d) => Number(d) as Weekday),
    bothWays: str(a, Q.commuteBothWays) !== 'no',
  };
}

export function winterSportsOf(a: QuizAnswers): WinterSport[] {
  const chosen = (a[Q.winterSports] as readonly string[] | undefined) ?? [];
  return WINTER_SPORTS.filter((s) => chosen.includes(s));
}

const POOL: Record<(typeof SWIM_WATERS)[number], PoolLength> = {
  pool25: 25,
  pool50: 50,
  openwater: 'openwater',
};

export interface OnboardingResult {
  /** Arguments of `generatePlan`, in order. */
  profile: UserProfile;
  goal: { kind: GoalKind };
  availability: Availability;
  startDate: string;
  targetDate?: string;
  /** Input for the heart-rate zones (Profile → Training zones). */
  hrZones: HrZoneInput;
  body: { age: number; sex: Sex; heightCm: number; weightKg: number };
  /** Kept for the user's profile; the engine does not use it yet. */
  bikeHoursPerWeek?: number;
  motivation: { why: string[]; barriers: string[]; note?: string };
  /**
   * "My own routines" was chosen but no routine exists yet: the plan schedules no strength until
   * the user builds one.
   */
  strengthRoutinesPending: boolean;
}

export type OnboardingMapping =
  { ok: true; value: OnboardingResult } | { ok: false; issues: QuizIssue[] };

/** Validated answers → everything `generatePlan` needs (plus profile data for later features). */
export function toPlanInput(
  given: QuizAnswers,
  today: string,
  library: { routines?: Routine[]; customExercises?: CustomExercise[] } = {},
): OnboardingMapping {
  const a = prepareAnswers(given, today);
  const issues = validateOnboarding(a, today);
  if (issues.length > 0) return { ok: false, issues };

  const goal = goalOf(a) as GoalKind;
  const sports = sportsOf(a);
  const age = num(a, Q.age) as number;
  let strength: StrengthSetup = toStrengthSetup(a, library);
  const strengthRoutinesPending =
    strength.mode === 'routines' && (strength.routines ?? []).length === 0;
  if (strengthRoutinesPending) strength = { mode: 'log' };

  const profile: UserProfile = {
    age,
    experience: str(a, Q.experience) as Experience,
    sports,
    terrain: str(a, Q.terrain) as Terrain,
    strength,
  };
  const threshold = thresholdPaceOf(a);
  if (threshold !== undefined) profile.thresholdPaceSecPerKm = threshold;
  if (sports.includes('swim')) {
    profile.poolLength = POOL[str(a, Q.swimWater) as keyof typeof POOL];
    profile.canSwim400m = str(a, Q.swimAbility) === 'comfortable';
    const css = cssPaceOf(a);
    if (css !== undefined) profile.cssPacePer100mSec = css;
  }
  if (sports.includes('bike')) profile.hasPowerMeter = str(a, Q.bikePowerMeter) === 'yes';
  const commute = commuteOf(a);
  if (commute) profile.commutes = [commute];
  const sessions = sessionsOf(a);
  if (sessions) profile.sessionsPerWeek = sessions;
  const winterSports = winterSportsOf(a);
  if (winterSports.length > 0) profile.winterSports = winterSports;
  // Longest recent session per sport: the long-session floor of the new plan (swims in metres).
  const longest: NonNullable<UserProfile['recentLongest']> = {};
  for (const [sport, id, perKm] of [
    ['run', Q.runLongest, 1],
    ['bike', Q.bikeLongest, 1],
    ['swim', Q.swimLongest, 1000],
  ] as const) {
    const value = num(a, id);
    if (sports.includes(sport) && value !== undefined) longest[sport] = { km: value / perKm };
  }
  if (Object.keys(longest).length > 0) profile.recentLongest = longest;

  const minutes = a[Q.availability] as readonly number[];
  const note = str(a, Q.note)?.trim();
  const result: OnboardingResult = {
    profile,
    goal: { kind: goal },
    availability: {
      minutesPerDay: minutes.slice(0, 7) as unknown as Availability['minutesPerDay'],
      doublesAllowed: str(a, Q.doubles) === 'yes',
    },
    startDate: planStartDate(today),
    hrZones: { age, restingHr: num(a, Q.restingHr), hrMax: num(a, Q.hrMax) },
    body: {
      age,
      sex: str(a, Q.sex) as Sex,
      heightCm: num(a, Q.heightCm) as number,
      weightKg: num(a, Q.weightKg) as number,
    },
    motivation: {
      why: [...((a[Q.why] as readonly string[] | undefined) ?? [])],
      barriers: [...((a[Q.barriers] as readonly string[] | undefined) ?? [])],
      ...(note ? { note } : {}),
    },
    strengthRoutinesPending,
  };
  const targetDate = str(a, Q.targetDate);
  if (isRaceGoal(goal) && targetDate) result.targetDate = targetDate;
  const bikeHours = num(a, Q.bikeHours);
  if (sports.includes('bike') && bikeHours !== undefined) result.bikeHoursPerWeek = bikeHours;
  return { ok: true, value: result };
}
