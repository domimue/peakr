import {
  buildStravaUpload,
  estimateStrengthKcal,
  sessionDurationMin,
  type CustomExercise,
  type GymSession,
  type GymSet,
  type ShareChoice,
  type ShareState,
  type ShareTarget,
} from '@peakr/engine';
import { create } from 'zustand';

import * as shareRepo from '@/data/repositories/share-repository';
import type { SessionShares } from '@/data/repositories/share-repository';
import i18n from '@/i18n';
import { health } from '@/features/health/health';
import { connect } from '@/features/integrations/api';

import { exerciseName } from '../session';
import { postToStrava, stravaUploadStatus } from './strava-api';
import { pollStrava, postSessionToStrava, type StravaRunnerDeps } from './strava-runner';

/**
 * Sharing finished sessions (Strava, Health Connect / HealthKit): the state per session and target
 * lives here and in SQLite, so it survives leaving the screen and restarting the app. Nothing is
 * shared unless the caller passes a choice that is on (the user's per-session decision, defaulting
 * to the setting, which is off until switched on).
 */

interface ShareStore {
  states: Record<string, SessionShares>;
  load(sessionId: string): Promise<void>;
  set(sessionId: string, target: ShareTarget, state: ShareState): void;
}

export const useShareStore = create<ShareStore>()((set) => ({
  states: {},
  async load(sessionId) {
    const stored = await shareRepo.getShareStates(sessionId);
    // A newer in-memory state (a post running right now) wins over the stored one.
    set((s) => ({ states: { ...s.states, [sessionId]: { ...stored, ...s.states[sessionId] } } }));
  },
  set(sessionId, target, state) {
    set((s) => ({
      states: { ...s.states, [sessionId]: { ...s.states[sessionId], [target]: state } },
    }));
    void shareRepo.saveShareState(sessionId, target, state);
  },
}));

const deps: StravaRunnerDeps = {
  post: postToStrava,
  status: stravaUploadStatus,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

export interface SessionData {
  session: GymSession;
  sets: readonly GymSet[];
  custom: readonly CustomExercise[];
}

function utcOffsetSec(startedAt: number): number {
  return -new Date(startedAt).getTimezoneOffset() * 60;
}

function kcalOf({ session, sets }: SessionData): number {
  const minutes = sessionDurationMin(session, [...sets]);
  return estimateStrengthKcal(minutes, session.sessionRpe ? { rpe: session.sessionRpe } : {});
}

/**
 * Posts to Strava. `plain` is only ever passed after the user accepted the weaker summary-only
 * activity (structured upload unavailable); it is stored and shown as plain.
 */
export function shareToStrava(data: SessionData, options: { plain?: boolean } = {}): Promise<void> {
  const { session, sets, custom } = data;
  const upload = buildStravaUpload(
    session,
    sets,
    {
      utcOffsetSec: utcOffsetSec(session.startedAt),
      custom,
      calories: kcalOf(data),
      exerciseName: (id) => exerciseName(i18n.t, id, custom),
    },
    { structuredAvailable: !options.plain },
  );
  const report = (state: ShareState) => useShareStore.getState().set(session.id, 'strava', state);
  return postSessionToStrava(session.id, upload, report, deps);
}

/** Picks up a post that was still processing when the app was closed. */
export function resumeStravaPoll(sessionId: string): Promise<void> {
  const report = (state: ShareState) => useShareStore.getState().set(sessionId, 'strava', state);
  return pollStrava(sessionId, 'structured', report, deps);
}

/** The scope upgrade: Strava's consent screen again; on success the post is retried. */
export async function allowStravaPosting(data: SessionData): Promise<'ok' | 'denied'> {
  const result = await connect('strava', 'upload');
  if (result !== 'connected') return 'denied';
  void shareToStrava(data);
  return 'ok';
}

export async function shareToHealth(data: SessionData): Promise<void> {
  const { session } = data;
  const report = (state: ShareState) => useShareStore.getState().set(session.id, 'health', state);
  report({ status: 'posting', at: Date.now() });
  if (!(await health.hasWritePermission()) && !(await health.requestWritePermission())) {
    return report({ status: 'failed', error: 'permission', at: Date.now() });
  }
  const minutes = sessionDurationMin(session, [...data.sets]);
  const result = await health.writeStrengthWorkout({
    sessionId: session.id,
    title: session.title,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? session.startedAt + minutes * 60_000,
    kcal: kcalOf(data),
    ...(session.notes ? { notes: session.notes } : {}),
  });
  report(
    result.ok
      ? {
          status: 'posted',
          at: Date.now(),
          ...(result.recordId ? { remoteId: result.recordId } : {}),
        }
      : { status: 'failed', error: result.reason, at: Date.now() },
  );
}

/** Starts the targets the user switched on; targets that are off are never touched. */
export function shareSession(data: SessionData, choice: ShareChoice): void {
  if (choice.strava) void shareToStrava(data);
  if (choice.health) void shareToHealth(data);
}
