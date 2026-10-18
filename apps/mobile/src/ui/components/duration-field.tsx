import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { FieldShell, Input } from './field';

export interface DurationParts {
  h: string;
  m: string;
  s: string;
}

export interface DurationFieldProps {
  label: string;
  value: DurationParts;
  onChange: (value: DurationParts) => void;
  onBlur?: () => void;
  showHours?: boolean;
  /** Short unit labels, e.g. { h: 'h', m: 'min', s: 's' }. */
  unitLabels: { h: string; m: string; s: string };
  /** Accessibility labels for the separate inputs. */
  accessibilityLabels: { h: string; m: string; s: string };
  hint?: string;
  error?: string;
}

const DIGITS = /\D/g;

/** Time entry as separate h / min / s number fields – works with the numeric keypad. */
export function DurationField({
  label,
  value,
  onChange,
  onBlur,
  showHours = false,
  unitLabels,
  accessibilityLabels,
  hint,
  error,
}: DurationFieldProps) {
  const parts = showHours ? (['h', 'm', 's'] as const) : (['m', 's'] as const);
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <View style={styles.row}>
        {parts.map((part) => (
          <View key={part} style={styles.part}>
            <Input
              value={value[part]}
              onChangeText={(text) => onChange({ ...value, [part]: text.replace(DIGITS, '') })}
              onBlur={onBlur}
              keyboardType="number-pad"
              maxLength={part === 'm' && !showHours ? 3 : 2}
              placeholder="0"
              suffix={unitLabels[part]}
              invalid={Boolean(error)}
              accessibilityLabel={`${label}, ${accessibilityLabels[part]}`}
            />
          </View>
        ))}
      </View>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  part: { flex: 1 },
});
