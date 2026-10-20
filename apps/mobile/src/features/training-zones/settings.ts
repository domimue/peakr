import type { HrZoneMethod, ReferenceRaceId, ZoneNumber } from '@peakr/engine';

import type { StoredPlanInput } from '@/data/db/schema';

/** A manually set heart rate range for one zone, inclusive bpm. */
export interface HrZoneOverride {
  minBpm: number;
  maxBpm: number;
}

/** A manually set pace range for one zone in seconds per km / per 100 m (slowest > fastest). */
export interface PaceZoneOverride {
  slowestSec: number;
  fastestSec: number;
}

export type ZoneKind = 'hr' | 'runPace' | 'swimPace';

export interface ZoneOverrides {
  hr: Partial<Record<ZoneNumber, HrZoneOverride>>;
  runPace: Partial<Record<ZoneNumber, PaceZoneOverride>>;
  swimPace: Partial<Record<ZoneNumber, PaceZoneOverride>>;
}

/** What Profile → Training zones stores next to the heart-rate input (`StoredPlanInput.zones`). */
export interface StoredZoneSettings {
  overrides: ZoneOverrides;
  /** Recent race or time trial for the running pace zones. */
  runReference?: { distance: ReferenceRaceId; timeSec: number };
  /** 400 m + 200 m time trial for swim CSS. */
  swimTest?: { time400Sec: number; time200Sec: number };
}

/**
 * Everything the user told us about their physiology. The zones themselves are always derived
 * from this via the engine (see `resolveTrainingZones`), so the plan never sees stale numbers.
 */
export interface TrainingZoneSettings extends StoredZoneSettings {
  /** null = automatic: Karvonen once resting HR is known, otherwise %HRmax. */
  hrMethod: HrZoneMethod | null;
  age?: number;
  hrMax?: number;
  restingHr?: number;
  lthr?: number;
}

export const emptyOverrides = (): ZoneOverrides => ({ hr: {}, runPace: {}, swimPace: {} });

/** The settings as they are stored with the plan (onboarding fills `hrZones`). */
export function zoneSettingsOf(input: StoredPlanInput): TrainingZoneSettings {
  const hr = input.hrZones ?? {};
  return {
    hrMethod: hr.method ?? null,
    age: hr.age,
    hrMax: hr.hrMax,
    restingHr: hr.restingHr,
    lthr: hr.lthr,
    overrides: input.zones?.overrides ?? emptyOverrides(),
    ...(input.zones?.runReference ? { runReference: input.zones.runReference } : {}),
    ...(input.zones?.swimTest ? { swimTest: input.zones.swimTest } : {}),
  };
}

/** Drops undefined keys, so stored JSON stays clean and comparable. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Writes the settings into the plan input. A race result or swim test also sets the threshold
 * pace / CSS the engine derives every run and swim target from; without one the onboarding values
 * stay.
 */
export function withZoneSettings(
  input: StoredPlanInput,
  settings: TrainingZoneSettings,
  paces: { thresholdPaceSecPerKm?: number; cssPacePer100mSec?: number },
): StoredPlanInput {
  const { hrMethod, age, hrMax, restingHr, lthr, overrides, runReference, swimTest } = settings;
  return {
    ...input,
    hrZones: defined({ method: hrMethod ?? undefined, age, hrMax, restingHr, lthr }),
    zones: defined({ overrides, runReference, swimTest }),
    profile: { ...input.profile, ...defined(paces) },
  };
}
