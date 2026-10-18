export const palette = {
  brand: '#E8553D',
  brandDark: '#FF7A5C',
} as const;

export const colors = {
  light: {
    background: '#FFFFFF',
    surface: '#F4F4F6',
    surfaceSelected: '#E4E4E9',
    text: '#111114',
    textSecondary: '#5F616B',
    border: '#DCDCE2',
    primary: palette.brand,
    onPrimary: '#FFFFFF',
    danger: '#C62828',
    zone1: '#8FA3B8',
    zone2: '#3E9E5B',
    zone3: '#D9A400',
    zone4: '#EE7D22',
    zone5: '#D7263D',
  },
  dark: {
    background: '#0B0B0D',
    surface: '#1B1B1F',
    surfaceSelected: '#2A2A30',
    text: '#F4F4F6',
    textSecondary: '#A6A8B2',
    border: '#2E2E35',
    primary: palette.brandDark,
    onPrimary: '#0B0B0D',
    danger: '#FF6B6B',
    zone1: '#9DB2C8',
    zone2: '#54C177',
    zone3: '#F2C230',
    zone4: '#FF9445',
    zone5: '#FF5468',
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type ThemeColors = { [K in keyof (typeof colors)['light']]: string };

export type ZoneColorKey = 'zone1' | 'zone2' | 'zone3' | 'zone4' | 'zone5';

export function zoneColorKey(zone: 1 | 2 | 3 | 4 | 5): ZoneColorKey {
  return `zone${zone}`;
}
