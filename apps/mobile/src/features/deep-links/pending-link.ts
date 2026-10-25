import type { Href } from 'expo-router';

import { parseStoredTarget } from './targets';

/**
 * A link that arrived while nobody was signed in: remembered until the sign-in finishes, then
 * opened instead of Today. Kept in expo-sqlite's localStorage (installed together with Supabase),
 * so it survives the app being closed while the user fetches the magic link from their email.
 * Without Supabase there is no sign-in, and the link opens directly.
 */

const KEY = 'peakr.pendingLink';
/** An old link is not opened by surprise days later. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Stored {
  target: string;
  savedAt: number;
}

function storage(): Storage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
}

export function savePendingLink(target: Href, now = Date.now()): void {
  if (typeof target !== 'string') return;
  lastTaken = null;
  const value: Stored = { target, savedAt: now };
  try {
    storage()?.setItem(KEY, JSON.stringify(value));
  } catch {
    // Not remembering the link only means Today opens after the sign-in.
  }
}

/**
 * The sign-in screen and the magic-link callback both finish a sign-in, often a moment apart;
 * whichever asks second must get the same answer, not Today.
 */
const SHARE_TAKEN_MS = 10_000;
let lastTaken: { target: Href; at: number } | null = null;

/** Returns the remembered target (if still fresh) and forgets it. */
export function takePendingLink(now = Date.now()): Href | null {
  if (lastTaken && now - lastTaken.at < SHARE_TAKEN_MS) return lastTaken.target;
  lastTaken = null;
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (raw === null) return null;
    store.removeItem(KEY);
    const stored = JSON.parse(raw) as Partial<Stored>;
    if (typeof stored.savedAt !== 'number' || now - stored.savedAt > MAX_AGE_MS) return null;
    const target = parseStoredTarget(stored.target);
    if (target) lastTaken = { target, at: now };
    return target;
  } catch {
    return null;
  }
}
