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
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type ThemeColors = { [K in keyof (typeof colors)['light']]: string };
