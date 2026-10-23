import type { WatchProviderId } from '@peakr/watch';

import { featureFlags } from '@/config/feature-flags';

/** What the user picked in the watch picker: a platform, or no watch at all. */
export type WatchChoice = WatchProviderId | 'none';

export const WATCH_CHOICES: readonly WatchChoice[] = [
  'garmin',
  'coros',
  'suunto',
  'apple',
  'file',
  'none',
];

/** Platforms Peakr can talk to directly (everything else goes through files or WorkoutKit). */
export type DirectWatch = 'garmin' | 'coros' | 'suunto';

export function isDirect(choice: WatchChoice): choice is DirectWatch {
  return choice === 'garmin' || choice === 'coros' || choice === 'suunto';
}

/** Whether the direct sync of this platform is switched on in this build. */
export function directEnabled(watch: DirectWatch): boolean {
  return watch === 'garmin'
    ? featureFlags.garminWatch
    : watch === 'coros'
      ? featureFlags.corosWatch
      : featureFlags.suuntoWatch;
}

export type OptionState =
  /** Works now. */
  | 'ready'
  /** The platform's partner approval is pending: the user gets the file export for now. */
  | 'fileForNow'
  /** Apple Watch: comes with the iPhone app. */
  | 'iosOnly';

export function optionState(choice: WatchChoice, os: 'android' | 'ios'): OptionState {
  if (choice === 'apple') return os === 'ios' ? 'ready' : 'iosOnly';
  if (isDirect(choice) && !directEnabled(choice)) return 'fileForNow';
  return 'ready';
}

export function parseWatchChoice(value: unknown): WatchChoice | null {
  return WATCH_CHOICES.find((c) => c === value) ?? null;
}
