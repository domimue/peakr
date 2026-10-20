/** Weight and distance units for the gym (CLAUDE.md "Localisation": metric default, imperial optional). */

export type WeightUnit = 'kg' | 'lb';
export type DistanceUnit = 'm' | 'km' | 'mi' | 'ft' | 'yd';

/** Exact by definition (international avoirdupois pound). */
export const KG_PER_LB = 0.45359237;

const METRES: Record<DistanceUnit, number> = {
  m: 1,
  km: 1000,
  mi: 1609.344,
  ft: 0.3048,
  yd: 0.9144,
};

/** Converts a weight to kg. Stored values keep full precision so lb entries round-trip exactly. */
export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function toMetres(value: number, unit: DistanceUnit): number {
  return value * METRES[unit];
}

export function fromMetres(m: number, unit: DistanceUnit): number {
  return m / METRES[unit];
}

/** Rounds to the nearest multiple of `step` without float noise (e.g. 2.5 kg plates, 0.1 for display). */
export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/** A stored kg value shown in the user's unit, rounded to 0.1 (kg or lb). */
export function displayWeight(kg: number, unit: WeightUnit): number {
  return roundToStep(fromKg(kg, unit), 0.1);
}
