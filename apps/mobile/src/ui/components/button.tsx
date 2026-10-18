import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import { Text } from './text';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  /** Compact inline button (e.g. "Remove" in a list row). */
  small?: boolean;
}

export function Button({ label, variant = 'primary', small, disabled, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const background = variant === 'primary' ? colors.primary : colors.surface;
  const color =
    variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [
        small ? styles.small : styles.button,
        { backgroundColor: pressed ? colors.surfaceSelected : background },
        variant !== 'primary' && {
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
        },
        disabled && styles.disabled,
      ]}
      {...rest}
    >
      <Text variant={small ? 'caption' : 'body'} style={[styles.label, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    minHeight: 32,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
