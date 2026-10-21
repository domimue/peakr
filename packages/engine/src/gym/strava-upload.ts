import type { CustomExercise } from '../plan/library';
import { sessionDurationMin } from './summary';
import { stravaExerciseType, type StravaExerciseType } from './strava-exercises';
import type { GymSession, GymSet } from './types';

/**
 * Builds what Peakr sends to Strava for a finished gym session.
 *
 * Structured (preferred): the JSON format of `POST /uploads` with `data_type=json`, limited by
 * Strava to weight training (docs: developers.strava.com/docs/uploads, changelog 21 May 2026).
 * Fields as documented there: `version` "1.0", `start_time`, `utc_offset` (s), `elapsed_time` (s),
 * optional `active_time`, `total_calories`, `creator`, and `sets[]` with `exercise_type`,
 * `repetitions`, `weight` (kg), `duration` (s). Strava needs at least one set.
 *
 * Plain (fallback, `POST /activities`, sport_type WeightTraining): a readable summary in the
 * description. Used only when the structured upload is unavailable for the app or the session has
 * no sets (quick log). The result always says which one was built; the UI must not present the
 * plain version as the structured one.
 */

export interface StravaSetJson {
  exercise_type: StravaExerciseType;
  repetitions?: number;
  /** Kilograms. */
  weight?: number;
  /** Seconds, for timed exercises. */
  duration?: number;
}

export interface StravaStrengthJson {
  version: '1.0';
  start_time: string;
  utc_offset: number;
  elapsed_time: number;
  active_time?: number;
  total_calories?: number;
  creator: { name: string };
  sets: StravaSetJson[];
}

export interface StravaUploadReport {
  /** Completed sets that went into the upload. */
  sent: number;
  /** Sets whose exercise has no exact Strava type (sent with a generic type, not dropped). */
  generic: { exerciseId: string; type: StravaExerciseType; sets: number }[];
  /** Sets that were not completed and therefore not posted. */
  skippedIncomplete: number;
}

export interface StravaUploadContext {
  /** Offset of the user's time zone at the session start, in seconds. */
  utcOffsetSec: number;
  custom?: readonly CustomExercise[];
  /** Display name of an exercise id, used by the plain summary. */
  exerciseName?: (exerciseId: string) => string;
  /** Estimated energy, as written to Health Connect. */
  calories?: number;
  /** Name shown on Strava; defaults to the session title. */
  name?: string;
}

export type StravaUpload =
  | {
      format: 'structured';
      name: string;
      sportType: 'WeightTraining';
      payload: StravaStrengthJson;
      report: StravaUploadReport;
    }
  | {
      format: 'plain';
      name: string;
      sportType: 'WeightTraining';
      startTime: string;
      elapsedSec: number;
      description: string;
      /** Why the structured format was not used. */
      reason: 'unavailable' | 'no_sets';
      report: StravaUploadReport;
    };

const CREATOR = 'Peakr';

function toSetJson(set: GymSet, type: StravaExerciseType): StravaSetJson {
  const out: StravaSetJson = { exercise_type: type };
  if (set.reps !== undefined && set.reps > 0) out.repetitions = Math.round(set.reps);
  if (set.weightKg !== undefined && set.weightKg > 0) out.weight = round(set.weightKg, 2);
  if (set.durationSec !== undefined && set.durationSec > 0)
    out.duration = Math.round(set.durationSec);
  return out;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Completed sets in logged order; every one of them is posted, warm-ups included. */
function postedSets(sets: readonly GymSet[]): GymSet[] {
  return sets.filter((s) => s.completed).sort((a, b) => a.setIndex - b.setIndex);
}

function elapsedSeconds(session: GymSession, sets: readonly GymSet[]): number {
  return Math.max(60, sessionDurationMin(session, [...sets]) * 60);
}

export function buildStravaUpload(
  session: GymSession,
  allSets: readonly GymSet[],
  ctx: StravaUploadContext,
  options: { structuredAvailable: boolean },
): StravaUpload {
  const own = allSets.filter((s) => s.sessionId === session.id);
  const posted = postedSets(own);
  const customById = new Map((ctx.custom ?? []).map((c) => [c.id, c]));
  const generic = new Map<string, { type: StravaExerciseType; sets: number }>();
  const typed = posted.map((set) => {
    const match = stravaExerciseType(set.exerciseId, customById.get(set.exerciseId));
    if (match.quality !== 'exact') {
      const entry = generic.get(set.exerciseId) ?? { type: match.type, sets: 0 };
      entry.sets += 1;
      generic.set(set.exerciseId, entry);
    }
    return { set, type: match.type };
  });
  const report: StravaUploadReport = {
    sent: posted.length,
    generic: [...generic.entries()].map(([exerciseId, v]) => ({ exerciseId, ...v })),
    skippedIncomplete: own.length - posted.length,
  };
  const name = ctx.name ?? session.title;
  const startTime = new Date(session.startedAt).toISOString();
  const elapsedSec = elapsedSeconds(session, own);

  if (!options.structuredAvailable || posted.length === 0) {
    return {
      format: 'plain',
      name,
      sportType: 'WeightTraining',
      startTime,
      elapsedSec,
      description: plainDescription(session, typed, ctx),
      reason: posted.length === 0 ? 'no_sets' : 'unavailable',
      report,
    };
  }
  const payload: StravaStrengthJson = {
    version: '1.0',
    start_time: startTime,
    utc_offset: Math.round(ctx.utcOffsetSec),
    elapsed_time: elapsedSec,
    creator: { name: CREATOR },
    sets: typed.map(({ set, type }) => toSetJson(set, type)),
  };
  if (ctx.calories !== undefined && ctx.calories > 0) {
    payload.total_calories = Math.round(ctx.calories);
  }
  return { format: 'structured', name, sportType: 'WeightTraining', payload, report };
}

function plainDescription(
  session: GymSession,
  typed: readonly { set: GymSet; type: StravaExerciseType }[],
  ctx: StravaUploadContext,
): string {
  const nameOf = ctx.exerciseName ?? ((id: string) => id);
  // Map keeps insertion order: exercises appear in the order they were first trained.
  const byExercise = new Map<string, string[]>();
  for (const { set } of typed) {
    byExercise.set(set.exerciseId, [...(byExercise.get(set.exerciseId) ?? []), formatSet(set)]);
  }
  const lines = [...byExercise].map(([id, parts]) => `${nameOf(id)}: ${parts.join(', ')}`);
  if (lines.length === 0 && session.sessionRpe !== undefined) {
    lines.push(`RPE ${session.sessionRpe}`);
  }
  return lines.join('\n');
}

function formatSet(set: GymSet): string {
  if (set.reps && set.weightKg) return `${set.reps} × ${round(set.weightKg, 2)} kg`;
  if (set.reps) return `${set.reps} reps`;
  if (set.durationSec) return `${Math.round(set.durationSec)} s`;
  return '1 set';
}
