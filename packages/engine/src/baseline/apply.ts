import { estimateHrMax, type HrZoneInput } from '../hr';
import type { Experience, PlanBaseline, Sport, UserProfile } from '../plan/types';
import { thresholdFromEasyPace } from '../run';
import type { BaselineResult, Derived } from './types';

/** Values the user typed on the summary screen. They always win over the derived ones. */
export interface BaselineOverrides {
  experience?: Partial<Record<Sport, Experience>>;
  longMin?: Partial<Record<Sport, number>>;
  weeklyLoad?: number;
  easyPaceSecPerKm?: number;
  cssPacePer100mSec?: number;
  hrMax?: number;
  lthr?: number;
}

const valueOf = <T>(d: Derived<T>): T | undefined => (d.status === 'ok' ? d.value : undefined);

/**
 * Puts a baseline into the profile. Precedence: the user's own entries (summary overrides, then
 * the quiz/zone settings already in the profile) beat derived values, which beat the defaults.
 * Derived values live in `profile.baseline` only, so a recalibration replaces them without
 * touching anything the user entered. Never changes plan state, history or load.
 */
export function calibrateProfile(
  profile: UserProfile,
  result: BaselineResult,
  overrides: BaselineOverrides = {},
): UserProfile {
  const experience: Partial<Record<Sport, Experience>> = {};
  const longMin: Partial<Record<Sport, number>> = {};
  for (const s of result.sports) {
    if (!profile.sports.includes(s.sport)) continue;
    const level = overrides.experience?.[s.sport] ?? valueOf(s.experience);
    if (level !== undefined) experience[s.sport] = level;
    const long = overrides.longMin?.[s.sport] ?? valueOf(s.volume)?.longMin;
    if (long !== undefined && long > 0) longMin[s.sport] = long;
  }
  const easy = valueOf(result.easyPaceSecPerKm);
  const baseline: PlanBaseline = {
    ...(Object.keys(experience).length > 0 ? { experience } : {}),
    ...(Object.keys(longMin).length > 0 ? { longMin } : {}),
    ...defined('startLoad', overrides.weeklyLoad ?? valueOf(result.weeklyLoad)),
    ...defined(
      'thresholdPaceSecPerKm',
      easy === undefined ? undefined : thresholdFromEasyPace(easy),
    ),
    ...defined('cssPacePer100mSec', valueOf(result.cssPacePer100mSec)),
    ...baselineHr(result, profile.age),
  };
  const next: UserProfile = { ...profile };
  delete next.baseline;
  if (Object.keys(baseline).length > 0) next.baseline = baseline;
  // Paces typed on the summary are user entries: they go where the quiz puts its entries.
  if (overrides.easyPaceSecPerKm !== undefined)
    next.thresholdPaceSecPerKm = thresholdFromEasyPace(overrides.easyPaceSecPerKm);
  if (overrides.cssPacePer100mSec !== undefined)
    next.cssPacePer100mSec = overrides.cssPacePer100mSec;
  return next;
}

/** HR values typed on the summary go into the user's own zone input. */
export function calibrateHrInput(input: HrZoneInput, overrides: BaselineOverrides): HrZoneInput {
  return {
    ...input,
    ...defined('hrMax', overrides.hrMax),
    ...defined('lthr', overrides.lthr),
  };
}

/** Derived HR values that may fill gaps in the user's zone input. */
export type BaselineHr = Pick<PlanBaseline, 'hrMax' | 'lthr'>;

/**
 * Derived HR values worth keeping: an observed HRmax only counts when it is above the age
 * estimate (an observed maximum is a lower bound), LTHR only below that HRmax.
 */
export function baselineHr(result: BaselineResult, age: number): BaselineHr {
  const observed = valueOf(result.hrMax);
  const hrMax = observed !== undefined && observed > estimateHrMax(age) ? observed : undefined;
  const lthr = valueOf(result.lthr);
  return {
    ...defined('hrMax', hrMax),
    ...defined('lthr', lthr !== undefined && lthr < (hrMax ?? Infinity) ? lthr : undefined),
  };
}

/** The user's zone input with gaps filled from the baseline; the user's entries win. */
export function effectiveHrInput(input: HrZoneInput, hr: BaselineHr | undefined): HrZoneInput {
  if (!hr) return input;
  return {
    ...input,
    ...defined('hrMax', input.hrMax ?? hr.hrMax),
    ...defined('lthr', input.lthr ?? hr.lthr),
  };
}

function defined<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
