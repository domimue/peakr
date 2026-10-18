import { zoneConfig } from './config';
import { assertDefined, checkRange, type Result, type ValidationIssue } from './result';
import type { ZoneNumber } from './zones';

const cfg = zoneConfig.hr;

export type HrZoneMethod = 'percentMax' | 'karvonen' | 'lthr';

export const HR_ZONE_METHODS: readonly HrZoneMethod[] = ['percentMax', 'karvonen', 'lthr'];

export type HrZoneField = 'age' | 'hrMax' | 'restingHr' | 'lthr';

export interface HrZoneInput {
  /** Omit to use the default rule: Karvonen if resting HR is known, else %HRmax. */
  method?: HrZoneMethod;
  age?: number;
  /** Measured maximum heart rate. If missing, it is estimated from age. */
  hrMax?: number;
  restingHr?: number;
  /** Lactate threshold heart rate (e.g. avg HR of the last 20 min of a 30-min solo time trial). */
  lthr?: number;
}

/** Inclusive bpm range. `null` = open-ended (LTHR Z1 has no lower bound, Z5 none without HRmax). */
export interface HrZone {
  zone: ZoneNumber;
  minBpm: number | null;
  maxBpm: number | null;
}

export interface HrZoneResult {
  method: HrZoneMethod;
  /** HRmax used for the calculation; null for LTHR without a measured HRmax. */
  hrMax: number | null;
  hrMaxIsEstimate: boolean;
  restingHr: number | null;
  lthr: number | null;
  zones: HrZone[];
}

/** Z1 lower … Z5 upper in bpm (not rounded). Only the outer ends can be open. */
type Boundaries = readonly [number | null, number, number, number, number, number | null];
type Fractions = readonly [number, number, number, number, number, number];

/**
 * Estimated maximum heart rate: 208 − 0.7 × age.
 * Only used when the user does not know their real HRmax – always show it as an estimate.
 */
export function estimateHrMax(age: number): number {
  if (!Number.isFinite(age) || age <= 0) {
    throw new RangeError(`age must be a positive number, got ${age}`);
  }
  return Math.round(cfg.hrMaxEstimate.intercept - cfg.hrMaxEstimate.slope * age);
}

/** CLAUDE.md default: Karvonen if resting HR is known, else %HRmax. */
export function defaultHrMethod(input: Pick<HrZoneInput, 'restingHr'>): HrZoneMethod {
  return input.restingHr !== undefined ? 'karvonen' : 'percentMax';
}

export function calculateHrZones(input: HrZoneInput): Result<HrZoneResult, HrZoneField> {
  const method = input.method ?? defaultHrMethod(input);
  const issues: ValidationIssue<HrZoneField>[] = [];

  const age = checkRange(issues, 'age', input.age, cfg.limits.age);
  const measuredHrMax = checkRange(issues, 'hrMax', input.hrMax, cfg.limits.hrMax) ?? null;
  const restingHr = checkRange(issues, 'restingHr', input.restingHr, cfg.limits.restingHr) ?? null;
  const lthr = checkRange(issues, 'lthr', input.lthr, cfg.limits.lthr) ?? null;

  if (method !== 'lthr' && input.age === undefined && input.hrMax === undefined) {
    issues.push({ field: 'age', code: 'ageOrHrMaxRequired' });
  }
  if (method === 'karvonen' && input.restingHr === undefined) {
    issues.push({ field: 'restingHr', code: 'required' });
  }
  if (method === 'lthr' && input.lthr === undefined) {
    issues.push({ field: 'lthr', code: 'required' });
  }

  const hrMax = measuredHrMax ?? (age === undefined ? null : estimateHrMax(age));

  if (restingHr !== null && hrMax !== null && restingHr >= hrMax) {
    issues.push({ field: 'restingHr', code: 'restingHrNotBelowHrMax', params: { hrMax } });
  }
  // Only a measured HRmax is compared: the age estimate can be lower than a real LTHR.
  if (lthr !== null && measuredHrMax !== null && lthr >= measuredHrMax) {
    issues.push({ field: 'lthr', code: 'lthrNotBelowHrMax', params: { hrMax: measuredHrMax } });
  }

  if (issues.length > 0) return { ok: false, issues };

  if (method === 'lthr') {
    const threshold = assertDefined(lthr, 'lthr');
    const f = cfg.boundaries.lthr;
    // A measured HRmax caps Z5; otherwise Z5 is open-ended.
    const boundaries: Boundaries = [
      null,
      f[1] * threshold,
      f[2] * threshold,
      f[3] * threshold,
      f[4] * threshold,
      measuredHrMax,
    ];
    return success(method, measuredHrMax, false, null, threshold, boundaries);
  }

  const max = assertDefined(hrMax, 'hrMax');
  const hrMaxIsEstimate = measuredHrMax === null;

  if (method === 'karvonen') {
    const rest = assertDefined(restingHr, 'restingHr');
    const boundaries = scale(cfg.boundaries.karvonen, (p) => rest + p * (max - rest));
    return success(method, max, hrMaxIsEstimate, rest, null, boundaries);
  }

  const boundaries = scale(cfg.boundaries.percentMax, (p) => p * max);
  return success(method, max, hrMaxIsEstimate, null, null, boundaries);
}

function scale(f: Fractions, fn: (fraction: number) => number): Boundaries {
  return [fn(f[0]), fn(f[1]), fn(f[2]), fn(f[3]), fn(f[4]), fn(f[5])];
}

function success(
  method: HrZoneMethod,
  hrMax: number | null,
  hrMaxIsEstimate: boolean,
  restingHr: number | null,
  lthr: number | null,
  boundaries: Boundaries,
): Result<HrZoneResult, HrZoneField> {
  return {
    ok: true,
    value: { method, hrMax, hrMaxIsEstimate, restingHr, lthr, zones: toZones(boundaries) },
  };
}

/** Five contiguous, inclusive integer bpm ranges: each zone ends one bpm below the next. */
function toZones([lower, b1, b2, b3, b4, upper]: Boundaries): HrZone[] {
  const r = Math.round;
  return [
    { zone: 1, minBpm: lower === null ? null : r(lower), maxBpm: r(b1) - 1 },
    { zone: 2, minBpm: r(b1), maxBpm: r(b2) - 1 },
    { zone: 3, minBpm: r(b2), maxBpm: r(b3) - 1 },
    { zone: 4, minBpm: r(b3), maxBpm: r(b4) - 1 },
    { zone: 5, minBpm: r(b4), maxBpm: upper === null ? null : r(upper) },
  ];
}
