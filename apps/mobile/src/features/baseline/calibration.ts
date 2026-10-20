import {
  calculateHrZones,
  calibrateHrInput,
  calibrateProfile,
  deriveBaseline,
  type BaselineResult,
  type HrZoneInput,
  type UserProfile,
} from '@peakr/engine';

import type { StoredPlanInput } from '@/data/db/schema';
import type { BaselineMeta, StoredBaselineActivity } from '@/data/repositories/baseline-repository';

/** Age used for the HR estimates while the quiz has not asked for it yet. */
const FALLBACK_AGE = 35;

export interface CalibrationContext {
  today: string;
  age?: number;
  /** The user's own HR input so far (quiz or Training zones). */
  hrZones?: HrZoneInput;
}

/** Derived values from the ticked activities. */
export function deriveCalibration(
  activities: readonly StoredBaselineActivity[],
  meta: BaselineMeta,
  ctx: CalibrationContext,
): BaselineResult {
  const age = ctx.age ?? ctx.hrZones?.age ?? FALLBACK_AGE;
  const zones = calculateHrZones({ age, ...ctx.hrZones });
  return deriveBaseline(
    activities.filter((a) => a.selected),
    {
      today: ctx.today,
      age,
      hrZones: zones.ok ? zones.value.zones : [],
      stravaHrZones: meta.stravaHrZones,
    },
  );
}

type CalibratedInput = Pick<StoredPlanInput, 'hrZones' | 'stravaHrZones'> & {
  profile: UserProfile;
};

type Calibrated<T> = T & Pick<StoredPlanInput, 'stravaHrZones'>;

/** The onboarding input with the reviewed baseline applied; unchanged without a baseline. */
export function calibrateOnboarding<T extends CalibratedInput>(
  input: T,
  baseline: { activities: readonly StoredBaselineActivity[]; meta: BaselineMeta | null },
  today: string,
): Calibrated<T> {
  const { activities, meta } = baseline;
  if (!meta || activities.length === 0) return input;
  const result = deriveCalibration(activities, meta, {
    today,
    age: input.profile.age,
    hrZones: input.hrZones,
  });
  return applyCalibration(input, result, meta);
}

/**
 * Puts the calibration into a plan input: derived values into `profile.baseline`, the user's
 * own summary entries where their entries go, and the HR zones they set on Strava. Reference data
 * only – it never adds anything to the plan's history, load or completion.
 */
export function applyCalibration<T extends CalibratedInput>(
  input: T,
  result: BaselineResult,
  meta: BaselineMeta,
): Calibrated<T> {
  const next: Calibrated<T> = {
    ...input,
    profile: calibrateProfile(input.profile, result, meta.overrides),
    hrZones: calibrateHrInput(input.hrZones ?? {}, meta.overrides),
  };
  if (meta.stravaHrZones) next.stravaHrZones = meta.stravaHrZones;
  else delete next.stravaHrZones;
  return next;
}
