import { create } from 'zustand';

/**
 * "Create a new plan" in the same account (CLAUDE.md "Plan history"): while it runs, the quiz
 * and the forecast lead to the confirmation instead of the watch step and the paywall.
 */
interface NewPlanFlow {
  active: boolean;
  start: () => void;
  end: () => void;
}

export const useNewPlanFlow = create<NewPlanFlow>()((set) => ({
  active: false,
  start: () => set({ active: true }),
  end: () => set({ active: false }),
}));
