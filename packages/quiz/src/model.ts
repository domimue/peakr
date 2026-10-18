/**
 * Generic quiz model: questions with branching (`visibleIf`), defaults and validation. Both
 * surfaces render the same definitions, so answers – and everything derived from them – match.
 */

import type { ValidationCode } from '@peakr/engine';

export type QuizQuestionId = string;
export type QuizAnswerValue = string | number | boolean | readonly string[] | readonly number[];
export type QuizAnswers = Readonly<Partial<Record<QuizQuestionId, QuizAnswerValue>>>;

/** Facts from outside a question group that change branching, defaults or validation. */
export interface QuizContext {
  /** The selected goal is a race (affects the default strength priority). */
  raceGoal: boolean;
  /** Local ISO date the quiz is answered on; needed by date questions. */
  today?: string;
}

export interface QuizOption {
  value: string;
  /** i18n keys: `<labelKey>` and, if present, `<descriptionKey>`. */
  labelKey: string;
  descriptionKey?: string;
}

interface QuestionBase {
  id: QuizQuestionId;
  titleKey: string;
  hintKey?: string;
  /** Shown only when this returns true (default: always). */
  visibleIf?: (answers: QuizAnswers) => boolean;
  /** May stay unanswered. */
  optional?: boolean;
  /** Checks that need other answers (e.g. resting HR below max HR); runs on valid values only. */
  check?: (answers: QuizAnswers, ctx: QuizContext) => QuizIssue[];
}

export interface SingleChoiceQuestion extends QuestionBase {
  kind: 'single';
  options: readonly QuizOption[];
  defaultValue?: (answers: QuizAnswers, ctx: QuizContext) => string | undefined;
}

export interface MultiChoiceQuestion extends QuestionBase {
  kind: 'multi';
  options: readonly QuizOption[];
  /** Fewest selections; 0 makes the question effectively optional. */
  minSelected: number;
  defaultValue?: (answers: QuizAnswers, ctx: QuizContext) => readonly string[] | undefined;
}

export interface NumberQuestion extends QuestionBase {
  kind: 'number';
  /** Allowed range; may depend on earlier answers. */
  range: (answers: QuizAnswers) => { min: number; max: number };
  defaultValue?: (answers: QuizAnswers, ctx: QuizContext) => number | undefined;
  unitKey?: string;
}

/** A time in whole seconds (race time, pace per km, swim time). */
export interface DurationQuestion extends QuestionBase {
  kind: 'duration';
  range: (answers: QuizAnswers) => { min: number; max: number };
  /** Entry with an hours field (race times) instead of min:s only. */
  withHours?: boolean;
  unitKey?: string;
}

/** Minutes available per weekday, Monday first (7 whole numbers). */
export interface WeekMinutesQuestion extends QuestionBase {
  kind: 'weekMinutes';
  /** Per-day limit. */
  range: { min: number; max: number; step: number };
  defaultValue?: (answers: QuizAnswers, ctx: QuizContext) => readonly number[] | undefined;
}

/** Local ISO date (YYYY-MM-DD) within `range` days from `ctx.today`. */
export interface DateQuestion extends QuestionBase {
  kind: 'date';
  rangeDays: { min: number; max: number };
}

export interface TextQuestion extends QuestionBase {
  kind: 'text';
  maxLength: number;
}

/** A statement the user has to confirm (health disclaimer). */
export interface ConfirmQuestion extends QuestionBase {
  kind: 'confirm';
  /** i18n key of the checkbox label. */
  labelKey: string;
}

export type QuizQuestion =
  | SingleChoiceQuestion
  | MultiChoiceQuestion
  | NumberQuestion
  | DurationQuestion
  | WeekMinutesQuestion
  | DateQuestion
  | TextQuestion
  | ConfirmQuestion;

/** Quiz-specific codes plus the engine's validation codes (shared translations). */
export type QuizIssueCode =
  ValidationCode | 'invalidOption' | 'tooFewSelected' | 'tooLong' | 'mustConfirm';

export interface QuizIssue {
  questionId: QuizQuestionId;
  code: QuizIssueCode;
  params?: Readonly<Record<string, number>>;
}

/** Questions the user sees for the current answers, in order. */
export function visibleQuestions(
  questions: readonly QuizQuestion[],
  answers: QuizAnswers,
): QuizQuestion[] {
  return questions.filter((q) => q.visibleIf?.(answers) ?? true);
}

/**
 * Fills defaults for visible, unanswered questions – in order, so later defaults can depend on
 * earlier ones. Answers to questions that are no longer visible are removed.
 */
export function withDefaults(
  questions: readonly QuizQuestion[],
  answers: QuizAnswers,
  ctx: QuizContext,
): QuizAnswers {
  const out: Partial<Record<QuizQuestionId, QuizAnswerValue>> = {};
  for (const q of questions) {
    if (!(q.visibleIf?.(out) ?? true)) continue;
    const given = answers[q.id];
    const value = given ?? ('defaultValue' in q ? q.defaultValue?.(out, ctx) : undefined);
    if (value !== undefined) out[q.id] = value;
  }
  return out;
}

const isWholeNumber = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** ISO date → days since 1970-01-01 (UTC), or null if invalid. */
export function isoToDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return ms / 86_400_000;
}

export function dayToIso(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** Issue for one value, ignoring cross-field checks; undefined when valid. */
function valueIssue(
  q: QuizQuestion,
  value: QuizAnswerValue,
  answers: QuizAnswers,
  ctx: QuizContext | undefined,
): Omit<QuizIssue, 'questionId'> | undefined {
  switch (q.kind) {
    case 'single':
      return q.options.some((o) => o.value === value) ? undefined : { code: 'invalidOption' };
    case 'multi': {
      if (!Array.isArray(value) || value.some((v) => !q.options.some((o) => o.value === v))) {
        return { code: 'invalidOption' };
      }
      if (new Set(value).size !== value.length) return { code: 'invalidOption' };
      return value.length < q.minSelected
        ? { code: 'tooFewSelected', params: { min: q.minSelected } }
        : undefined;
    }
    case 'number':
    case 'duration': {
      const { min, max } = q.range(answers);
      return isWholeNumber(value) && value >= min && value <= max
        ? undefined
        : { code: 'outOfRange', params: { min, max } };
    }
    case 'weekMinutes': {
      const { min, max } = q.range;
      const ok =
        Array.isArray(value) &&
        value.length === 7 &&
        value.every((v) => isWholeNumber(v) && v >= min && v <= max);
      return ok ? undefined : { code: 'outOfRange', params: { min, max } };
    }
    case 'date': {
      const day = typeof value === 'string' ? isoToDay(value) : null;
      if (day === null) return { code: 'invalidDate' };
      const today = ctx?.today === undefined ? null : isoToDay(ctx.today);
      if (today === null) return undefined;
      const { min, max } = q.rangeDays;
      return day - today >= min && day - today <= max
        ? undefined
        : { code: 'outOfRange', params: { min, max } };
    }
    case 'text':
      if (typeof value !== 'string') return { code: 'required' };
      return value.length > q.maxLength
        ? { code: 'tooLong', params: { max: q.maxLength } }
        : undefined;
    case 'confirm':
      return value === true ? undefined : { code: 'mustConfirm' };
  }
}

/** An empty text or a cleared field counts as unanswered. */
function isEmpty(value: QuizAnswerValue | undefined): boolean {
  return value === undefined || (typeof value === 'string' && value.trim() === '');
}

/** Checks every visible question; hidden questions are ignored. */
export function validateAnswers(
  questions: readonly QuizQuestion[],
  answers: QuizAnswers,
  ctx?: QuizContext,
): QuizIssue[] {
  const issues: QuizIssue[] = [];
  for (const q of visibleQuestions(questions, answers)) {
    const value = answers[q.id];
    if (value === undefined || isEmpty(value)) {
      if (q.kind === 'confirm') issues.push({ questionId: q.id, code: 'mustConfirm' });
      else if (!q.optional) issues.push({ questionId: q.id, code: 'required' });
      continue;
    }
    const issue = valueIssue(q, value, answers, ctx);
    if (issue) issues.push({ questionId: q.id, ...issue });
    else if (q.check) issues.push(...q.check(answers, ctx ?? { raceGoal: false }));
  }
  return issues;
}
