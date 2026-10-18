import type { QuizProgress } from '../onboarding-repository';

/** In-memory quiz progress for Jest (`jest.mock('@/data/repositories/onboarding-repository')`). */

export type { QuizProgress } from '../onboarding-repository';

export const store = { progress: null as QuizProgress | null };

export function resetStore(): void {
  store.progress = null;
}

export const getQuizProgress = jest.fn(async () => store.progress);
export const saveQuizProgress = jest.fn(async (progress: QuizProgress) => {
  store.progress = progress;
});
export const clearQuizProgress = jest.fn(async () => {
  store.progress = null;
});
