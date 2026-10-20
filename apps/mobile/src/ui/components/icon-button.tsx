import { Pressable, StyleSheet } from 'react-native';

import { buttonTokens, radius, useTheme } from '../theme';
import { Icon, type IconName } from './icon';

export interface IconButtonProps {
  icon: IconName;
  /** Read by screen readers (the button has no visible text). */
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}

/** Round secondary button with only an icon (e.g. previous / next week). */
export function IconButton({ icon, accessibilityLabel, onPress, disabled }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surface2 : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Icon name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: buttonTokens.secondaryBorderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
