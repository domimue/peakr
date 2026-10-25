import type { Href } from 'expo-router';

/**
 * Links into the app (Phase 10d): `https://<our domain>/open/<target>` (Android App Links, iOS
 * Universal Links) and `peakr://open/<target>`. Both arrive at the `open` route as path segments.
 * Only the targets listed here are opened; anything else falls back to Today, so a link from an
 * email or the website can never reach an internal or half-finished screen.
 *
 *   /open                      → Today
 *   /open/today                → Today
 *   /open/plan                 → Plan
 *   /open/workout/<id>         → that workout
 *   /open/gym · insights · profile
 *   /open/account              → Profile → Account
 *   /open/subscription         → Profile → Subscription
 */

const TABS = {
  today: '/today',
  plan: '/plan',
  gym: '/gym',
  insights: '/insights',
  profile: '/profile',
} as const;
const SCREENS = { account: '/auth/account', subscription: '/subscription' } as const;

const WORKOUT_ID = /^[\w.:-]{1,120}$/;

export const FALLBACK_TARGET: Href = '/today';

/** The screen a link opens, or null when the link names nothing we open. */
export function openTarget(segments: readonly string[]): Href | null {
  const [first, second, ...rest] = segments.filter((s) => s.length > 0);
  if (first === undefined) return FALLBACK_TARGET;
  if (rest.length > 0) return null;
  if (first === 'workout') {
    return second !== undefined && WORKOUT_ID.test(second)
      ? `/training/workout/${encodeURIComponent(second)}`
      : null;
  }
  if (second !== undefined) return null;
  if (Object.hasOwn(TABS, first)) return TABS[first as keyof typeof TABS];
  if (Object.hasOwn(SCREENS, first)) return SCREENS[first as keyof typeof SCREENS];
  return null;
}

/** Every fixed target `openTarget` can return. */
const TARGET_PATHS = new Set<string>([...Object.values(TABS), ...Object.values(SCREENS)]);

/** A target string read back from storage, accepted only if `openTarget` could have produced it. */
export function parseStoredTarget(value: unknown): Href | null {
  if (typeof value !== 'string') return null;
  if (TARGET_PATHS.has(value)) return value as Href;
  const workout = /^\/training\/workout\/([^/]+)$/.exec(value);
  if (!workout?.[1]) return null;
  let id: string;
  try {
    id = decodeURIComponent(workout[1]);
  } catch {
    return null;
  }
  return WORKOUT_ID.test(id) ? openTarget(['workout', id]) : null;
}
