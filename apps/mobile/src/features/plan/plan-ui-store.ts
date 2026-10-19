import type { MoveWarning, RebalanceSuggestion } from '@peakr/engine';
import { create } from 'zustand';

export type PlanView = 'week' | 'month';

/** What the last move caused – shown above the calendar until the user dismisses it. */
export interface MoveFeedback {
  workoutId: string;
  toDate: string;
  warnings: MoveWarning[];
  /** Other sessions the engine would move; applied only on "Apply". */
  suggestion: RebalanceSuggestion | null;
}

interface PlanUiState {
  view: PlanView;
  /** Monday of the week shown (null: the current week). */
  weekStart: string | null;
  /** First day of the month shown in the month view (null: the current month). */
  month: string | null;
  feedback: MoveFeedback | null;
  setView: (view: PlanView) => void;
  showWeek: (monday: string) => void;
  showMonth: (month: string) => void;
  setFeedback: (feedback: MoveFeedback | null) => void;
}

/** Calendar UI state of the Plan tab (survives navigating to a workout and back). */
export const usePlanUiStore = create<PlanUiState>()((set) => ({
  view: 'week',
  weekStart: null,
  month: null,
  feedback: null,
  setView: (view) => set({ view }),
  showWeek: (weekStart) => set({ weekStart, view: 'week' }),
  showMonth: (month) => set({ month }),
  setFeedback: (feedback) => set({ feedback }),
}));
