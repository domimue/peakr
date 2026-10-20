import {
  analyzeRaceResult,
  calculateCss,
  calculateHrZones,
  type CssField,
  type CssResult,
  type HrZone,
  type HrZoneField,
  type HrZoneResult,
  type PaceZone,
  type RaceAnalysis,
  type RaceAnalysisField,
  type Range,
  type Result,
  type ZoneNumber,
} from '@peakr/engine';

import type { StoredPlanInput } from '@/data/db/schema';

import {
  zoneSettingsOf,
  type HrZoneOverride,
  type PaceZoneOverride,
  type TrainingZoneSettings,
  type ZoneKind,
} from './settings';

type Custom<T> = T & { custom: boolean };

export interface ResolvedHrZones extends HrZoneResult {
  zones: Custom<HrZone>[];
}
export interface ResolvedRunZones extends RaceAnalysis {
  paceZones: Custom<PaceZone>[];
}
export interface ResolvedSwimZones extends CssResult {
  zones: Custom<PaceZone>[];
}

/** `null` = the user has not entered anything for that discipline yet. */
export interface ResolvedTrainingZones {
  hr: Result<ResolvedHrZones, HrZoneField> | null;
  run: Result<ResolvedRunZones, RaceAnalysisField> | null;
  swim: Result<ResolvedSwimZones, CssField> | null;
}

/** Turns the stored inputs into zones via the shared engine, then applies manual overrides. */
export function resolveTrainingZones(settings: TrainingZoneSettings): ResolvedTrainingZones {
  const { hrMethod, age, hrMax, restingHr, lthr, runReference, swimTest, overrides } = settings;

  const hasHrInput = [age, hrMax, restingHr, lthr].some((v) => v !== undefined);
  const hr = hasHrInput
    ? mapOk(
        calculateHrZones({ method: hrMethod ?? undefined, age, hrMax, restingHr, lthr }),
        (v) => ({ ...v, zones: applyOverrides(v.zones, overrides.hr) }),
      )
    : null;

  const run = runReference
    ? mapOk(analyzeRaceResult(runReference), (v) => ({
        ...v,
        paceZones: applyOverrides(v.paceZones, overrides.runPace),
      }))
    : null;

  const swim = swimTest
    ? mapOk(calculateCss(swimTest), (v) => ({
        ...v,
        zones: applyOverrides(v.zones, overrides.swimPace),
      }))
    : null;

  return { hr, run, swim };
}

/**
 * Heart rate zones of the plan, manual zones included – the single source for every bpm target
 * (workout screen, activity import). Empty without heart-rate input.
 */
export function planHrZones(input: StoredPlanInput | undefined): HrZone[] {
  if (!input) return [];
  const hr = resolveTrainingZones(zoneSettingsOf(input)).hr;
  return hr?.ok ? hr.value.zones.map(({ custom: _custom, ...zone }) => zone) : [];
}

function mapOk<T, U, F extends string>(result: Result<T, F>, fn: (value: T) => U): Result<U, F> {
  return result.ok ? { ok: true, value: fn(result.value) } : result;
}

function applyOverrides<Z extends { zone: ZoneNumber }>(
  zones: readonly Z[],
  overrides: Partial<Record<ZoneNumber, Partial<Z>>>,
): Custom<Z>[] {
  return zones.map((zone) => {
    const override = overrides[zone.zone];
    return override ? { ...zone, ...override, custom: true } : { ...zone, custom: false };
  });
}

/** Plausible limits for manual overrides (bpm, s/km, s/100 m). */
export const overrideLimits = {
  hr: { min: 30, max: 230 },
  runPace: { min: 120, max: 1200 },
  swimPace: { min: 40, max: 300 },
} as const satisfies Record<ZoneKind, Range>;

export type OverrideIssue = 'outOfRange' | 'hrOrder' | 'paceOrder';

/** Checks a manual override; returns why it cannot be saved, or undefined if it is fine. */
export function validateOverride(
  kind: ZoneKind,
  override: HrZoneOverride | PaceZoneOverride,
): OverrideIssue | undefined {
  const { min, max } = overrideLimits[kind];
  const values = Object.values(override) as number[];
  if (values.some((v) => !Number.isFinite(v) || v < min || v > max)) return 'outOfRange';
  if ('minBpm' in override) return override.minBpm < override.maxBpm ? undefined : 'hrOrder';
  return override.slowestSec > override.fastestSec ? undefined : 'paceOrder';
}
