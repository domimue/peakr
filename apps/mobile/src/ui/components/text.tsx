import {
  Text as RNText,
  StyleSheet,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { fontFamilies, typography, useTheme, type TypographyVariant } from '../theme';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  tone?: 'default' | 'secondary';
}

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * Archivo ships as one family per weight (400 / 500), so emphasis via `fontWeight` is mapped to
 * Archivo Medium instead of letting the platform synthesise a bold. Headlines keep the display face.
 */
function resolveFont(style: TextStyle): TextStyle {
  if (style.fontFamily !== fontFamilies.body || style.fontWeight === undefined) return style;
  const { fontWeight, ...rest } = style;
  const emphasised = fontWeight === 'bold' || Number(fontWeight) >= 500;
  return emphasised ? { ...rest, fontFamily: fontFamilies.bodyMedium } : rest;
}

/**
 * Every text uses tabular figures, so training numbers (pace, HR, times, km) line up everywhere.
 * Font scaling stays on (larger font sizes); layouts must wrap rather than clip.
 */
export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const flat: TextStyle =
    StyleSheet.flatten([
      TABULAR,
      typography[variant],
      { color: tone === 'secondary' ? colors.textMuted : colors.text },
      style,
    ]) ?? {};
  return <RNText style={resolveFont(flat)} {...rest} />;
}
