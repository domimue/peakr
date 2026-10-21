import type { LiveExercise, LiveSession, LiveSet } from './live-session';
import { SET_TYPES } from './types';

/**
 * Saving and restoring a running gym session (CLAUDE.md "Gym": nothing is lost if the app is
 * killed mid-session). The app writes `serializeLive` after every change; on start `restoreLive`
 * reads it back. The elapsed time needs no saving – it is always `now - startedAt`.
 */

export const LIVE_SESSION_VERSION = 1;

/** A session left open longer than this is offered to finish or discard, not to continue. */
export const STALE_SESSION_MS = 24 * 60 * 60 * 1000;

interface Stored {
  version: number;
  session: LiveSession;
}

export function serializeLive(session: LiveSession): string {
  const stored: Stored = { version: LIVE_SESSION_VERSION, session };
  return JSON.stringify(stored);
}

export interface RestoredLive {
  session: LiveSession;
  /** Since the start, in seconds. */
  elapsedSec: number;
  /** Left open for more than a day (finish or discard). */
  stale: boolean;
}

/**
 * The saved session, or null when nothing usable was saved (empty, corrupt, an unknown version).
 * A rest timer that ran out while the app was closed is dropped.
 */
export function restoreLive(json: string | null | undefined, now: number): RestoredLive | null {
  if (!json) return null;
  let stored: unknown;
  try {
    stored = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObject(stored) || stored.version !== LIVE_SESSION_VERSION) return null;
  const session = stored.session;
  if (!isLiveSession(session)) return null;
  const rest = session.rest && session.rest.endsAt > now ? session.rest : null;
  return {
    session: { ...session, rest },
    elapsedSec: Math.max(0, Math.floor((now - session.startedAt) / 1000)),
    stale: now - session.startedAt > STALE_SESSION_MS,
  };
}

/** Elapsed time of a running session in whole seconds. */
export function elapsedSec(session: Pick<LiveSession, 'startedAt'>, now: number): number {
  return Math.max(0, Math.floor((now - session.startedAt) / 1000));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optNum = (v: unknown) => v === undefined || isNum(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function isLiveSet(v: unknown): v is LiveSet {
  return (
    isObject(v) &&
    isStr(v.id) &&
    (SET_TYPES as readonly unknown[]).includes(v.setType) &&
    typeof v.completed === 'boolean' &&
    optNum(v.weightKg) &&
    optNum(v.reps) &&
    optNum(v.durationSec) &&
    optNum(v.rpe) &&
    optNum(v.completedAt)
  );
}

function isLiveExercise(v: unknown): v is LiveExercise {
  return (
    isObject(v) &&
    isStr(v.entryId) &&
    isStr(v.exerciseId) &&
    isStr(v.prescription) &&
    typeof v.timed === 'boolean' &&
    isNum(v.restSec) &&
    Array.isArray(v.sets) &&
    v.sets.every(isLiveSet)
  );
}

function isLiveSession(v: unknown): v is LiveSession {
  if (!isObject(v)) return false;
  const rest = v.rest;
  return (
    isStr(v.id) &&
    isStr(v.title) &&
    isStr(v.date) &&
    isNum(v.startedAt) &&
    Array.isArray(v.exercises) &&
    v.exercises.every(isLiveExercise) &&
    (rest === null ||
      (isObject(rest) && isNum(rest.startedAt) && isNum(rest.endsAt) && isStr(rest.entryId))) &&
    (v.focus === null || (isObject(v.focus) && isStr(v.focus.entryId) && isStr(v.focus.setId)))
  );
}
