import type { ActivityNotice } from './apply';

/**
 * New activities reached the plan: the app shows a short in-app notice (CLAUDE.md "After import":
 * "Run synced from Strava – Thursday's session marked as done"). Keeps the data layer free of UI.
 */

type Listener = (notices: readonly ActivityNotice[]) => void;

const listeners = new Set<Listener>();

export function notifyActivities(notices: readonly ActivityNotice[]): void {
  if (notices.length === 0) return;
  for (const listener of listeners) listener(notices);
}

export function onActivities(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
