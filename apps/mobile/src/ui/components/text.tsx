import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { typography, useTheme, type TypographyVariant } from '../theme';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  tone?: 'default' | 'secondary';
}

export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[
        typography[variant],
        { color: tone === 'secondary' ? colors.textSecondary : colors.text },
        style,
      ]}
      {...rest}
    />
  );
}
