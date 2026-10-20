import type { TrackingMode } from '../plan/library';
import type { LegLoad } from '../plan/types';

/**
 * Gym workspace data model (CLAUDE.md "Gym"): routines, logged sessions and their sets.
 * Weights are always stored in kg, distances in metres, times in seconds; units are converted only
 * for display and import (`units.ts`).
 */

export const SET_TYPES = ['warmup', 'working', 'drop', 'failure'] as const;
export type SetType = (typeof SET_TYPES)[number];

/** What one routine entry asks for per set. */
export type SetTarget =
  | { kind: 'reps'; min: number; max: number }
  | { kind: 'time'; minSec: number; maxSec: number }
  | { kind: 'distance'; m: number };

export interface GymRoutineExercise {
  /** Stable id of this entry (supersets and reordering refer to it). */
  id: string;
  /** Library id or `custom:<id>`. */
  exerciseId: string;
  targetSets: number;
  target: SetTarget;
  targetRpe?: number;
  /** Reps in reserve; an alternative to RPE, never both. */
  targetRir?: number;
  restSec: number;
  /** Entries sharing a group are done as a superset, in list order. */
  supersetGroup?: string;
  notes?: string;
  /** Planned working weight; empty for bodyweight. */
  weightKg?: number;
  /** Overrides the exercise's leg load for scheduling (kept from Phase 3 routines). */
  legLoad?: LegLoad;
}

export interface RoutineFolder {
  id: string;
  name: string;
  position: number;
}

export interface GymRoutine {
  id: string;
  name: string;
  notes?: string;
  folderId?: string;
  /** Order within its folder (or the unfiled list). */
  position: number;
  /** Archived routines are hidden from the list and the planner, never deleted. */
  archivedAt?: number;
  /** Planned duration; estimated from the sets when not set (`estimateRoutineMinutes`). */
  durationMin?: number;
  exercises: GymRoutineExercise[];
}

export type GymSessionSource = 'app' | 'migrated' | 'import:hevy' | 'import:strong' | 'import:csv';

export interface GymSession {
  id: string;
  /** Local calendar day (YYYY-MM-DD), used to match the plan. */
  date: string;
  /** Epoch ms. */
  startedAt: number;
  endedAt?: number;
  title: string;
  /** `detailed` sessions have sets; `quick` sessions only duration, RPE and "legs" (§8.7). */
  kind: 'detailed' | 'quick';
  /** Required for quick sessions; detailed sessions derive it from start/end or their sets. */
  durationMin?: number;
  sessionRpe?: number;
  /** Quick log: the session trained legs (counts as heavy leg load). */
  legs?: boolean;
  notes?: string;
  routineId?: string;
  /** The planned workout this session fulfils. */
  plannedWorkoutId?: string;
  /** Template or `routine:<id>` the session was started from (as in Phase 3 logs). */
  sourceId?: string;
  source: GymSessionSource;
  /** Id of the session in the source app, to skip it on a repeated import. */
  externalId?: string;
}

export interface GymSet {
  id: string;
  sessionId: string;
  exerciseId: string;
  /** 0-based position within the session. */
  setIndex: number;
  setType: SetType;
  weightKg?: number;
  reps?: number;
  rpe?: number;
  durationSec?: number;
  distanceM?: number;
  completed: boolean;
  /** Epoch ms. */
  loggedAt: number;
  notes?: string;
}

export type { TrackingMode };
