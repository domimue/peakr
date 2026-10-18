import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import { FieldShell } from './field';
import { Text } from './text';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export interface ChipGroupProps<T extends string> {
  label: string;
  options: readonly ChipOption<T>[];
  /** Selected values; single-select groups pass one value. */
  selected: readonly T[];
  onToggle: (value: T) => void;
  multiple?: boolean;
  error?: string;
}

/** Wrapping row of selectable chips (pattern, equipment, filters). */
export function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
  multiple = false,
  error,
}: ChipGroupProps<T>) {
  const { colors } = useTheme();
  return (
    <FieldShell label={label} error={error}>
      <View accessibilityRole={multiple ? undefined : 'radiogroup'} style={styles.row}>
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <Pressable
              key={o.value}
              accessibilityRole={multiple ? 'checkbox' : 'radio'}
              accessibilityState={multiple ? { checked: on } : { selected: on }}
              onPress={() => onToggle(o.value)}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? colors.surfaceSelected : colors.surface,
                  borderColor: on ? colors.primary : colors.border,
                },
              ]}
            >
              <Text variant="caption" style={on && styles.on}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  on: { fontWeight: '600' },
});
