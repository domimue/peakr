import { QUESTION_IDS as Q, STRENGTH_QUESTION_IDS as S, type QuizAnswers } from '@peakr/quiz';

/** Complete answers for a 10k plan (running only, no strength). */
export const ANSWERS: QuizAnswers = {
  [Q.goal]: '10k',
  [Q.sports]: ['run'],
  [S.mode]: 'none',
  [Q.experience]: 'intermediate',
  [Q.runReference]: '5k',
  [Q.runRaceTime]: 25 * 60,
  [Q.availability]: [0, 45, 0, 45, 0, 90, 60],
  [Q.terrain]: 'rolling',
  [Q.why]: ['health'],
  [Q.barriers]: ['time'],
  [Q.age]: 35,
  [Q.sex]: 'female',
  [Q.heightCm]: 170,
  [Q.weightKg]: 62,
  [Q.disclaimer]: true,
};
