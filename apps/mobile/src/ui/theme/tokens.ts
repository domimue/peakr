import {
  buttonTokens,
  fontFamilies,
  fontSizes,
  letterSpacing,
  radii,
  spacing,
  typography as typeScale,
  type TypographyVariant,
} from '@peakr/theme';
import type { TextStyle } from 'react-native';

export { buttonTokens, fontFamilies, fontSizes, spacing };
export type { TypographyVariant };

/** Kept as `radius` for the existing components; values come from @peakr/theme. */
export const radius = radii;

function toTextStyle(variant: TypographyVariant): TextStyle {
  const { fontSize, lineHeight, family } = typeScale[variant];
  return {
    fontSize,
    lineHeight,
    fontFamily: fontFamilies[family],
    // Headlines use the display instance with −0.02em tracking (RN takes px).
    ...(family === 'display' ? { letterSpacing: letterSpacing.display * fontSize } : null),
  };
}

/** React Native text styles for every type role (12 / 14 / 16 / 20 / 24 / 32 / 44 scale). */
export const typography = Object.fromEntries(
  (Object.keys(typeScale) as TypographyVariant[]).map((variant) => [variant, toTextStyle(variant)]),
) as Record<TypographyVariant, TextStyle>;

/** Numbers in training data (pace, HR, times). */
export const numeric: TextStyle = { fontVariant: ['tabular-nums'] };
