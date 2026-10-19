import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { buttonTokens, radius, spacing, useTheme } from '../theme';
import { Icon, type IconName } from './icon';
import { Text } from './text';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  /** Compact inline button (e.g. "Remove" in a list row). */
  small?: boolean;
  /** Leading icon. */
  icon?: IconName;
}

/**
 * Primary: Volt fill, Ink text – one per screen. Secondary / danger: transparent with a 1.5 border.
 */
export function Button({
  label,
  variant = 'primary',
  small,
  icon,
  disabled,
  ...rest
}: ButtonProps) {
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
      <View style={styles.content}>
        {icon ? <Icon name={icon} size={small ? 16 : 20} color={color} /> : null}
        <Text variant={small ? 'caption' : 'label'} style={{ color }}>
          {label}
        </Text>
      </View>
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
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
