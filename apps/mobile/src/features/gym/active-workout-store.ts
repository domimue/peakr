import type { Workout } from '@peakr/engine';
import { create } from 'zustand';

/** Hands a planned strength workout (from the plan view) to the workout screen. */
interface ActiveWorkoutState {
  workout: Workout | null;
  setWorkout: (workout: Workout | null) => void;
}

export const useActiveWorkoutStore = create<ActiveWorkoutState>()((set) => ({
  workout: null,
  setWorkout: (workout) => set({ workout }),
}));
