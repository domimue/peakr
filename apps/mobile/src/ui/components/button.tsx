import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { buttonTokens, radius, spacing, useTheme } from '../theme';
import { Text } from './text';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  /** Compact inline button (e.g. "Remove" in a list row). */
  small?: boolean;
}

/**
 * Primary: Volt fill, Ink text – one per screen. Secondary / danger: transparent with a 1.5 border.
 */
export function Button({ label, variant = 'primary', small, disabled, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const primary = variant === 'primary';
  const color = primary ? colors.onAccent : variant === 'danger' ? colors.errorText : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [
        small ? styles.small : styles.button,
        primary
          ? { backgroundColor: pressed ? colors.accentPressed : colors.accent }
          : {
              backgroundColor: pressed ? colors.surface2 : 'transparent',
              borderColor: colors.border,
              borderWidth: buttonTokens.secondaryBorderWidth,
            },
        disabled && styles.disabled,
      ]}
      {...rest}
    >
      <Text variant={small ? 'caption' : 'label'} style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: buttonTokens.minHeight,
    borderRadius: buttonTokens.radius,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    minHeight: 32,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
});
