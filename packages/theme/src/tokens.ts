export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  button: 14,
  lg: 20,
  pill: 999,
} as const;

/** Type scale in px: 12 / 14 / 16 / 20 / 24 / 32 / 44. */
export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  display: 44,
} as const;

/** Font family names as registered in the app (expo-font) and as CSS variables on the web. */
export const fontFamilies = {
  /** Static Archivo instance wght 800 / wdth 112 (fonts/Peakr-Display.ttf) for headlines. */
  display: 'PeakrDisplay',
  /** Archivo width 100 %, 400 for body text. */
  body: 'Archivo_400Regular',
  /** Archivo width 100 %, 500 for UI labels. */
  bodyMedium: 'Archivo_500Medium',
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  display: 800,
} as const;

/** Letter spacing in em. */
export const letterSpacing = {
  display: -0.02,
  wordmark: -0.03,
} as const;

/** Numbers in training data (pace, HR, times) use tabular figures. */
export const numericFontVariant = 'tabular-nums';

export const buttonTokens = {
  minHeight: 48,
  radius: radii.button,
  secondaryBorderWidth: 1.5,
} as const;

/** Text roles mapped to the type scale. */
export const typography = {
  display: { fontSize: fontSizes.display, lineHeight: 48, family: 'display' },
  title: { fontSize: fontSizes.xxl, lineHeight: 38, family: 'display' },
  heading: { fontSize: fontSizes.lg, lineHeight: 26, family: 'display' },
  subtitle: { fontSize: fontSizes.xl, lineHeight: 30, family: 'display' },
  label: { fontSize: fontSizes.md, lineHeight: 22, family: 'bodyMedium' },
  body: { fontSize: fontSizes.md, lineHeight: 22, family: 'body' },
  caption: { fontSize: fontSizes.sm, lineHeight: 20, family: 'body' },
  micro: { fontSize: fontSizes.xs, lineHeight: 16, family: 'body' },
} as const satisfies Record<
  string,
  { fontSize: number; lineHeight: number; family: keyof typeof fontFamilies }
>;

export type TypographyVariant = keyof typeof typography;
