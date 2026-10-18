import { schemes, type ColorScheme, type SchemeColors, type ZoneNumber } from '@peakr/theme';

/** Semantic colours per scheme – all values come from @peakr/theme. */
export const colors: Record<ColorScheme, SchemeColors> = schemes;

export type { ColorScheme };
export type ThemeColors = SchemeColors;

export type ZoneColorKey = 'zone1' | 'zone2' | 'zone3' | 'zone4' | 'zone5';

export function zoneColorKey(zone: ZoneNumber): ZoneColorKey {
  return `zone${zone}`;
}
