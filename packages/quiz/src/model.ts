/**
 * Generic quiz model: questions with branching (`visibleIf`), defaults and validation. Both
 * surfaces render the same definitions, so answers – and everything derived from them – match.
 */

export type QuizQuestionId = string;
export type QuizAnswerValue = string | number;
export type QuizAnswers = Readonly<Partial<Record<QuizQuestionId, QuizAnswerValue>>>;

/** Facts from outside this question group that change branching or defaults. */
export interface QuizContext {
  /** The selected goal is a race (affects the default strength priority). */
  raceGoal: boolean;
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
}

export interface SingleChoiceQuestion extends QuestionBase {
  kind: 'single';
  options: readonly QuizOption[];
  defaultValue?: (answers: QuizAnswers, ctx: QuizContext) => string | undefined;
}

export interface NumberQuestion extends QuestionBase {
  kind: 'number';
  /** Allowed range; may depend on earlier answers. */
  range: (answers: QuizAnswers) => { min: number; max: number };
  defaultValue?: (answers: QuizAnswers, ctx: QuizContext) => number | undefined;
  unitKey?: string;
}

export type QuizQuestion = SingleChoiceQuestion | NumberQuestion;

export type QuizIssueCode = 'required' | 'invalidOption' | 'outOfRange';

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
    const value = given ?? q.defaultValue?.(out, ctx);
    if (value !== undefined) out[q.id] = value;
  }
  return out;
}

/** Checks every visible question; hidden questions are ignored. */
export function validateAnswers(
  questions: readonly QuizQuestion[],
  answers: QuizAnswers,
): QuizIssue[] {
  const issues: QuizIssue[] = [];
  for (const q of visibleQuestions(questions, answers)) {
    const value = answers[q.id];
    if (value === undefined) {
      issues.push({ questionId: q.id, code: 'required' });
    } else if (q.kind === 'single') {
      if (!q.options.some((o) => o.value === value)) {
        issues.push({ questionId: q.id, code: 'invalidOption' });
      }
    } else {
      const { min, max } = q.range(answers);
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        issues.push({ questionId: q.id, code: 'outOfRange', params: { min, max } });
      }
    }
  }
  return issues;
}
