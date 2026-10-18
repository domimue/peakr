import { Pressable, StyleSheet, View } from 'react-native';

import { numeric, radius, spacing, useTheme } from '../theme';
import { Text } from './text';

export interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Formats the shown value, e.g. `90 s`. */
  format?: (value: number) => string;
  /** Accessibility labels of the − / + buttons. */
  decreaseLabel: string;
  increaseLabel: string;
}

/** − value + control for small whole numbers (sets, days per week, rest). */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = String,
  decreaseLabel,
  increaseLabel,
}: StepperProps) {
  const { colors } = useTheme();
  const button = (text: string, a11y: string, next: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${a11y}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onChange(next)}
      style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[styles.sign, disabled && { color: colors.textMuted }]}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={styles.row}>
      <Text variant="caption" style={styles.label}>
        {label}
      </Text>
      <View style={styles.controls}>
        {button('−', decreaseLabel, Math.max(min, value - step), value <= min)}
        <Text accessibilityLabel={`${label}: ${format(value)}`} style={styles.value}>
          {format(value)}
        </Text>
        {button('+', increaseLabel, Math.min(max, value + step), value >= max)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: { fontWeight: '600', flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sign: { fontSize: 20, fontWeight: '600' },
  value: { ...numeric, minWidth: 56, textAlign: 'center', fontWeight: '500' },
});
