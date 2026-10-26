/**
 * Which value wins when several sources have one for the same day (CLAUDE.md "Energy & body
 * rules": manual entry > device/Health data > estimate). Among devices the watch provider comes
 * before the phone's health store, like activities.
 */
export const BODY_SOURCES = ['manual', 'garmin', 'healthConnect', 'healthKit', 'estimate'] as const;
export type BodySource = (typeof BODY_SOURCES)[number];

export function pickBySource<T extends { source: BodySource }>(values: readonly T[]): T | null {
  let best: T | null = null;
  for (const v of values) {
    if (!best || BODY_SOURCES.indexOf(v.source) < BODY_SOURCES.indexOf(best.source)) best = v;
  }
  return best;
}
