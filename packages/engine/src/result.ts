/** Machine-readable validation codes. UIs map them to translated messages. */
export type ValidationCode =
  | 'required'
  | 'ageOrHrMaxRequired'
  | 'outOfRange'
  | 'restingHrNotBelowHrMax'
  | 'lthrNotBelowHrMax'
  | 'unrealisticRaceTime'
  | 'swim400NotSlowerThan200'
  | 'swimTimesInconsistent'
  | 'invalidDate'
  | 'targetNotAfterStart'
  | 'planTooLong'
  | 'sportsRequired'
  | 'goalNeedsSports'
  | 'notEnoughAvailability'
  | 'underageWeightLoss'
  | 'bmiTooLow'
  | 'targetNotBelowCurrent'
  | 'targetNotAboveCurrent'
  | 'invalidFormat'
  | 'gpxEmpty'
  | 'gpxNoPoints'
  | 'gpxTooLarge'
  | 'belowBaselineLong'
  | 'belowBaselineVolume'
  | 'notEnoughDaysForSessions';

export interface ValidationIssue<F extends string> {
  field: F;
  code: ValidationCode;
  /** Values for the message, e.g. `{ min, max }` for `outOfRange`. */
  params?: Readonly<Record<string, number>>;
}

export type Result<T, F extends string> =
  { ok: true; value: T } | { ok: false; issues: ValidationIssue<F>[] };

export interface Range {
  readonly min: number;
  readonly max: number;
}

/**
 * Narrows a value that validation has already guaranteed. Throwing means a bug in the engine,
 * never bad user input – that is reported via `Result` issues.
 */
export function assertDefined<T>(value: T | null | undefined, name: string): T {
  /* v8 ignore next 3 -- defensive: unreachable after validation */
  if (value === null || value === undefined) {
    throw new Error(`engine invariant violated: ${name} missing after validation`);
  }
  return value;
}

/**
 * Returns the value if it was provided and lies within `range`; otherwise undefined.
 * Adds an `outOfRange` issue for provided values outside the range.
 */
export function checkRange<F extends string>(
  issues: ValidationIssue<F>[],
  field: F,
  value: number | undefined,
  range: Range,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < range.min || value > range.max) {
    issues.push({ field, code: 'outOfRange', params: { min: range.min, max: range.max } });
    return undefined;
  }
  return value;
}
