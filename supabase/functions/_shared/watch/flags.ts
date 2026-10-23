/**
 * Server-side feature flags of the watch platforms. Each one stays off until the platform's partner
 * programme has approved Peakr (CLAUDE.md "Integrations"); switch on with
 * `supabase secrets set WATCH_GARMIN_TRAINING=1` and so on – the code is shipped and tested before.
 */

export type WatchFlag = 'garminTraining' | 'garminCourses' | 'garminActivity' | 'coros' | 'suunto';

const ENV: Record<WatchFlag, string> = {
  garminTraining: 'WATCH_GARMIN_TRAINING',
  garminCourses: 'WATCH_GARMIN_COURSES',
  garminActivity: 'WATCH_GARMIN_ACTIVITY',
  coros: 'WATCH_COROS',
  suunto: 'WATCH_SUUNTO',
};

export type EnvReader = (name: string) => string | undefined;

export function flagEnabled(env: EnvReader, flag: WatchFlag): boolean {
  const value = env(ENV[flag]);
  return value === '1' || value === 'true';
}

export const WATCH_FLAGS: readonly WatchFlag[] = Object.keys(ENV) as WatchFlag[];
