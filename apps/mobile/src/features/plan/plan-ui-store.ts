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

/** The three views of the Plan tab (segmented control): week list, calendar, history and records. */
export type PlanView = 'weeks' | 'calendar' | 'history';

interface PlanUiState {
  view: PlanView;
  /** Monday of the first week the Calendar shows (null: the current week). */
  weekStart: string | null;
  feedback: MoveFeedback | null;
  setView: (view: PlanView) => void;
  /** Switches the Plan tab to the calendar, starting at that week. */
  showWeek: (monday: string) => void;
  setFeedback: (feedback: MoveFeedback | null) => void;
}

/** Plan tab UI state (survives switching tabs and opening a workout). */
export const usePlanUiStore = create<PlanUiState>()((set) => ({
  view: 'weeks',
  weekStart: null,
  feedback: null,
  setView: (view) => set({ view }),
  showWeek: (weekStart) => set({ weekStart, view: 'calendar' }),
  setFeedback: (feedback) => set({ feedback }),
}));
