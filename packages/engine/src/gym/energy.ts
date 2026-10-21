/**
 * Energy estimate of a strength session, written to Health Connect / HealthKit with the workout.
 * MET-based (Compendium of Physical Activities: resistance training 3.5 light … 6.0 vigorous),
 * scaled by the session RPE. Only an estimate – the body weight defaults until the user has one
 * on file (nutrition add-on), and the UI says so.
 */

export const STRENGTH_ENERGY = {
  /** Body weight assumed when none is known. */
  defaultBodyWeightKg: 75,
  met: { light: 3.5, moderate: 5, vigorous: 6 },
  /** Session RPE up to this is "light", up to `moderateMaxRpe` "moderate", above "vigorous". */
  lightMaxRpe: 4,
  moderateMaxRpe: 7,
  /** RPE assumed when the session has none. */
  defaultRpe: 6,
} as const;

export function strengthMet(rpe?: number): number {
  const r = rpe ?? STRENGTH_ENERGY.defaultRpe;
  if (r <= STRENGTH_ENERGY.lightMaxRpe) return STRENGTH_ENERGY.met.light;
  if (r <= STRENGTH_ENERGY.moderateMaxRpe) return STRENGTH_ENERGY.met.moderate;
  return STRENGTH_ENERGY.met.vigorous;
}

/** Total kilocalories of the session (MET × kg × hours), rounded. */
export function estimateStrengthKcal(
  durationMin: number,
  { rpe, bodyWeightKg }: { rpe?: number; bodyWeightKg?: number } = {},
): number {
  if (!(durationMin > 0)) return 0;
  const weight = bodyWeightKg ?? STRENGTH_ENERGY.defaultBodyWeightKg;
  return Math.round(strengthMet(rpe) * weight * (durationMin / 60));
}
