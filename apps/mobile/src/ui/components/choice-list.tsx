import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import { Text } from './text';

export interface Choice<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface ChoiceListProps<T extends string> {
  label: string;
  choices: readonly Choice<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
}

/** Single choice as stacked cards with an optional description (quiz questions). */
export function ChoiceList<T extends string>({
  label,
  choices,
  value,
  onChange,
}: ChoiceListProps<T>) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.list}>
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(choice.value)}
            style={[
              styles.choice,
              {
                backgroundColor: selected ? colors.surface2 : colors.surface,
                borderColor: selected ? colors.accentLine : colors.border,
              },
            ]}
          >
            <Text style={styles.label}>{choice.label}</Text>
            {choice.description ? (
              <Text variant="caption" tone="secondary">
                {choice.description}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  choice: { borderRadius: radius.md, borderWidth: 1.5, padding: spacing.md, gap: 2 },
  label: { fontWeight: '600' },
});
