import type { ReviewAnswers } from '@peakr/engine';
import { create } from 'zustand';

/**
 * "Create a new plan" in the same account (CLAUDE.md "Plan history"): while it runs, the quiz
 * and the forecast lead to the confirmation instead of the watch step and the paywall. Holds the
 * answers of "How was your last plan?" and whether the suggested difficulty is taken.
 */
interface NewPlanFlow {
  active: boolean;
  review: ReviewAnswers;
  acceptDifficulty: boolean;
  start: () => void;
  end: () => void;
  answer: (patch: ReviewAnswers) => void;
  skipReview: () => void;
  setAcceptDifficulty: (accept: boolean) => void;
}

export const useNewPlanFlow = create<NewPlanFlow>()((set, get) => ({
  active: false,
  review: {},
  acceptDifficulty: true,
  start: () => set({ active: true }),
  end: () => set({ active: false, review: {}, acceptDifficulty: true }),
  answer: (patch) => set({ review: { ...get().review, ...patch } }),
  skipReview: () => set({ review: {} }),
  setAcceptDifficulty: (acceptDifficulty) => set({ acceptDifficulty }),
}));
