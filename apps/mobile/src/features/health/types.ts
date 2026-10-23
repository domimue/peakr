/**
 * Health data behind one interface (CLAUDE.md "Platform strategy": platform code in
 * `.android.ts` / `.ios.ts`). Screens only import `./health`; Metro picks the platform file.
 */

export type HealthStore = 'healthConnect' | 'healthKit';

export interface StrengthWorkoutWrite {
  /** Peakr gym session id; the record is keyed on it, so writing twice updates one record. */
  sessionId: string;
  title: string;
  /** Epoch ms. */
  startedAt: number;
  endedAt: number;
  /** Estimated energy of the session (kcal); omitted when unknown. */
  kcal?: number;
  notes?: string;
}

export type WriteResult =
  | { ok: true; recordId: string | null }
  | { ok: false; reason: 'unsupported' | 'permission' | 'failed' };

export interface HealthProvider {
  /** Which store this is, for texts ("Health Connect" / "Apple Health"). */
  store: HealthStore;
  /** The platform has the store and it is usable (Health Connect installed and up to date). */
  isSupported(): Promise<boolean>;
  hasWritePermission(): Promise<boolean>;
  /** Shows the system permission sheet; resolves whether writing is now allowed. */
  requestWritePermission(): Promise<boolean>;
  /** Saves a finished gym session as a strength-training workout with duration and energy. */
  writeStrengthWorkout(workout: StrengthWorkoutWrite): Promise<WriteResult>;
}
