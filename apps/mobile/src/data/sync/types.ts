import type { Goal, PauseReason, Phase, PlanNote, Workout, WorkoutStatus } from '@peakr/engine';

import type { StoredPlanInput } from '../db/schema';

/** One plan week as it travels to the server (inside the plan row, without workouts). */
export interface SyncWeek {
  weekIndex: number;
  startDate: string;
  phase: Phase;
  isRecovery: boolean;
  isPartial: boolean;
  targetLoad: number;
  load: number;
  minutes: number;
  hardShare: number;
  notes: PlanNote[];
}

export interface SyncPause {
  reason: PauseReason;
  startDate: string;
  endDate: string | null;
}

/** A plan with its weeks and pauses; `updatedAt` / `createdAt` in epoch ms. */
export interface SyncPlan {
  id: string;
  input: StoredPlanInput;
  goal: Goal;
  startDate: string;
  targetDate: string | null;
  notes: PlanNote[];
  weeks: SyncWeek[];
  pauses: SyncPause[];
  revision: number;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SyncWorkout {
  planId: string;
  id: string;
  date: string;
  status: WorkoutStatus;
  data: Workout;
  deleted: boolean;
  updatedAt: number;
}

/** A locally deleted plan or workout waiting to be deleted on the server. */
export interface Tombstone {
  entity: 'plan' | 'workout';
  planId: string;
  id: string;
  deletedAt: number;
}

/** Everything the device has to push. */
export interface PendingChanges {
  /** The local plan, if it changed since the last push. */
  plan: SyncPlan | null;
  workouts: SyncWorkout[];
  tombstones: Tombstone[];
}

/** Version of a local row (or tombstone) used to decide conflicts. */
export interface LocalVersion {
  id: string;
  updatedAt: number;
}
