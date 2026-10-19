import type { MoveWarning, RebalanceSuggestion } from '@peakr/engine';
import { create } from 'zustand';

/** What the last move caused – shown above the calendar until the user dismisses it. */
export interface MoveFeedback {
  workoutId: string;
  toDate: string;
  warnings: MoveWarning[];
  /** Other sessions the engine would move; applied only on "Apply". */
  suggestion: RebalanceSuggestion | null;
}

interface PlanUiState {
  /** Monday of the first week the Calendar shows (null: the current week). */
  weekStart: string | null;
  feedback: MoveFeedback | null;
  showWeek: (monday: string) => void;
  setFeedback: (feedback: MoveFeedback | null) => void;
}

/** Calendar UI state (survives switching tabs and opening a workout). */
export const usePlanUiStore = create<PlanUiState>()((set) => ({
  weekStart: null,
  feedback: null,
  showWeek: (weekStart) => set({ weekStart }),
  setFeedback: (feedback) => set({ feedback }),
}));
