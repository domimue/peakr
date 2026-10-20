import { Pressable, StyleSheet, View } from 'react-native';

import { fontSizes, radius, spacing, useTheme } from '../theme';
import { Text } from './text';

export interface CheckListProps<T extends string> {
  label: string;
  choices: readonly { value: T; label: string; description?: string }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}

/** Multiple choice as stacked cards with a check mark (quiz questions). */
export function CheckList<T extends string>({
  label,
  choices,
  selected,
  onToggle,
}: CheckListProps<T>) {
  const { colors } = useTheme();
  return (
    <View accessibilityLabel={label} style={styles.list}>
      {choices.map((choice) => {
        const on = selected.includes(choice.value);
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={choice.label}
            accessibilityHint={choice.description}
            onPress={() => onToggle(choice.value)}
            style={[
              styles.choice,
              {
                backgroundColor: on ? colors.surface2 : colors.surface,
                borderColor: on ? colors.accentLine : colors.border,
              },
            ]}
          >
            <CheckBox checked={on} />
            <View style={styles.text}>
              <Text style={styles.label}>{choice.label}</Text>
              {choice.description ? (
                <Text variant="caption" tone="secondary">
                  {choice.description}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface CheckRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A single statement to confirm (e.g. the health disclaimer). */
export function CheckRow({ label, checked, onChange }: CheckRowProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.row}
    >
      <CheckBox checked={checked} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

/** The check mark box on its own (custom rows). */
export function CheckBox({ checked }: { checked: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.box,
        {
          borderColor: checked ? colors.accentLine : colors.border,
          backgroundColor: checked ? colors.accent : 'transparent',
        },
      ]}
    >
      {checked ? <Text style={[styles.tick, { color: colors.onAccent }]}>✓</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  text: { flex: 1, gap: 2 },
  label: { fontWeight: '600' },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { fontSize: fontSizes.sm, fontWeight: '700', lineHeight: 18 },
});
