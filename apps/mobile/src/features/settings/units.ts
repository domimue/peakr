import { formatDuration } from '@peakr/engine';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import type { Units } from './app-settings';
import { useSettingsStore } from './settings-store';

/**
 * Metric by default, imperial optional (CLAUDE.md "Localisation"). The engine always works in
 * metres and seconds per km; only what is shown is converted.
 */

export const KM_PER_MILE = 1.609344;

/** A distance in the user's unit, rounded to `digits` decimals ("12.3 km" / "7.6 mi"). */
export function distanceText(t: TFunction, units: Units, km: number, digits = 1): string {
  const value = units === 'imperial' ? km / KM_PER_MILE : km;
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return units === 'imperial' ? t('plan.mi', { value: rounded }) : t('plan.km', { value: rounded });
}

/** A pace in the user's unit ("5:10 /km" / "8:19 /mi"). */
export function paceText(units: Units, secPerKm: number): string {
  return units === 'imperial'
    ? `${formatDuration(Math.round(secPerKm * KM_PER_MILE))} /mi`
    : `${formatDuration(Math.round(secPerKm))} /km`;
}

/** The user's unit name for distances ("km" / "mi"). */
export const distanceUnit = (units: Units): string => (units === 'imperial' ? 'mi' : 'km');

/** Formatters bound to the current units setting. */
export function useUnits() {
  const { t } = useTranslation();
  const units = useSettingsStore((s) => s.units);
  return {
    units,
    distance: (km: number, digits = 1) => distanceText(t, units, km, digits),
    pace: (secPerKm: number) => paceText(units, secPerKm),
    unit: distanceUnit(units),
  };
}
