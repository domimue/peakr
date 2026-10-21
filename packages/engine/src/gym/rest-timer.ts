/**
 * Rest timer between sets (CLAUDE.md "Gym": live session). It is stored as timestamps, never as a
 * ticking counter: the remaining time is always `endsAt - now`, so the countdown is right after the
 * app was in the background or killed and restored.
 */

export interface RestTimer {
  /** Epoch ms. */
  startedAt: number;
  /** Epoch ms. */
  endsAt: number;
  /** The exercise whose set started the rest (its rest time is the one adjusted). */
  entryId: string;
}

/** Added by the "+15 s" button. */
export const REST_EXTEND_SEC = 15;
export const MAX_REST_SEC = 15 * 60;

export function startRest(entryId: string, restSec: number, now: number): RestTimer | null {
  if (restSec <= 0) return null;
  return { startedAt: now, endsAt: now + Math.min(restSec, MAX_REST_SEC) * 1000, entryId };
}

/** Whole seconds left, rounded up (shows 1 until the very end), never negative. */
export function remainingSec(timer: RestTimer, now: number): number {
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

export function isRestFinished(timer: RestTimer, now: number): boolean {
  return now >= timer.endsAt;
}

/** Share of the rest already done (0–1), for the progress bar. */
export function restProgress(timer: RestTimer, now: number): number {
  const total = timer.endsAt - timer.startedAt;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (now - timer.startedAt) / total));
}

/**
 * Adds (or with a negative value removes) seconds. Extending a finished timer starts again from
 * now; removing more than is left ends it (null).
 */
export function extendRest(timer: RestTimer, sec: number, now: number): RestTimer | null {
  const base = Math.max(timer.endsAt, sec > 0 ? now : timer.endsAt);
  const endsAt = Math.min(base + sec * 1000, now + MAX_REST_SEC * 1000);
  if (endsAt <= now) return null;
  return { ...timer, startedAt: Math.min(timer.startedAt, now), endsAt };
}
