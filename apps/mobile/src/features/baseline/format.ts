import { formatDuration, type Sport } from '@peakr/engine';
import type { TFunction } from 'i18next';

import type { StoredBaselineActivity } from '@/data/repositories/baseline-repository';

/** "6:10 /km" – pace from seconds per km. */
export function paceText(t: TFunction, secPerKm: number): string {
  return t('units.paceValue', {
    pace: formatDuration(Math.round(secPerKm)),
    unit: t('units.perKm'),
  });
}

/** "1:55 /100 m". */
export function swimPaceText(t: TFunction, secPer100m: number): string {
  return t('units.paceValue', {
    pace: formatDuration(Math.round(secPer100m)),
    unit: t('units.per100m'),
  });
}

/** Average pace or speed of an activity in the unit of its sport; null without a distance. */
export function activitySpeedText(t: TFunction, a: StoredBaselineActivity): string | null {
  if (!a.distanceM || a.distanceM <= 0) return null;
  if (a.sport === 'run') return paceText(t, a.durationSec / (a.distanceM / 1000));
  if (a.sport === 'swim') return swimPaceText(t, a.durationSec / (a.distanceM / 100));
  return t('baseline.kmh', { value: ((a.distanceM / a.durationSec) * 3.6).toFixed(1) });
}

export function distanceText(t: TFunction, sport: Sport, distanceM: number): string {
  return sport === 'swim'
    ? t('baseline.meters', { value: Math.round(distanceM) })
    : t('baseline.km', { value: (distanceM / 1000).toFixed(1) });
}

/** Parses "m:ss" (or plain seconds) into seconds; undefined when it is not a valid time. */
export function parseMinSec(text: string): number | undefined {
  const m = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(text);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return undefined;
}

/** Parses a positive whole number; undefined otherwise. */
export function parseWhole(text: string): number | undefined {
  if (!/^\s*\d+\s*$/.test(text)) return undefined;
  const n = Number(text);
  return n > 0 ? n : undefined;
}
