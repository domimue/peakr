/**
 * Shared quiz definition (questions, validation, branching, insights) rendered by web and app.
 * No UI code lives here. The full onboarding quiz is assembled from question groups; strength is
 * the first group.
 */

export {
  validateAnswers,
  visibleQuestions,
  withDefaults,
  type NumberQuestion,
  type QuizAnswers,
  type QuizAnswerValue,
  type QuizContext,
  type QuizIssue,
  type QuizIssueCode,
  type QuizOption,
  type QuizQuestion,
  type QuizQuestionId,
  type SingleChoiceQuestion,
} from './model';
export {
  SPLIT_IDS,
  STRENGTH_EQUIPMENT,
  STRENGTH_MODES,
  STRENGTH_PRIORITIES,
  STRENGTH_QUESTION_IDS,
  strengthAnswersFrom,
  strengthQuestions,
  toStrengthSetup,
} from './strength';
