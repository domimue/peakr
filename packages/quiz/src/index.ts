/**
 * Shared quiz definition (questions, validation, branching, insights) rendered by web and app.
 * No UI code lives here. Filled in a later phase.
 */

export type QuizQuestionId = string;

export interface QuizQuestion {
  id: QuizQuestionId;
  /** i18n key of the question title */
  titleKey: string;
}

export type QuizAnswers = Record<QuizQuestionId, unknown>;

export const quizQuestions: readonly QuizQuestion[] = [];
