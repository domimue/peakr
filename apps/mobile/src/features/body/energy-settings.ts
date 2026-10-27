import { energyConfig } from '@peakr/engine';

/**
 * How the energy target is built for this person (Body → Targets): the everyday activity outside
 * sport (asked once, editable), and protein and fat per kg. Kept on this device like the other
 * Body settings; the engine clamps every value to its allowed range.
 */

export type EverydayActivity = keyof typeof energyConfig.everydayActivity;

export const EVERYDAY_ACTIVITIES = Object.keys(
  energyConfig.everydayActivity,
) as readonly EverydayActivity[];

export interface EnergySettings {
  /** null = not answered yet (the default factor is used and the question is shown). */
  everydayActivity: EverydayActivity | null;
  proteinGPerKg: number;
  fatGPerKg: number;
}

export const DEFAULT_ENERGY_SETTINGS: EnergySettings = {
  everydayActivity: null,
  proteinGPerKg: energyConfig.macros.proteinGPerKg.default,
  fatGPerKg: energyConfig.macros.fatGPerKg.default,
};

const inRange = (v: unknown, r: { min: number; max: number }): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= r.min && v <= r.max;

export function parseEnergySettings(raw: unknown): EnergySettings {
  const d = DEFAULT_ENERGY_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Partial<Record<keyof EnergySettings, unknown>>;
  const m = energyConfig.macros;
  return {
    everydayActivity: (EVERYDAY_ACTIVITIES as readonly unknown[]).includes(r.everydayActivity)
      ? (r.everydayActivity as EverydayActivity)
      : null,
    proteinGPerKg: inRange(r.proteinGPerKg, m.proteinGPerKg) ? r.proteinGPerKg : d.proteinGPerKg,
    fatGPerKg: inRange(r.fatGPerKg, m.fatGPerKg) ? r.fatGPerKg : d.fatGPerKg,
  };
}
