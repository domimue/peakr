import { Pressable, StyleSheet } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import { Text } from './text';

export interface LinkRowProps {
  title: string;
  hint?: string;
  onPress: () => void;
}

/** Tappable row that opens another screen (Profile entries, routine list items). */
export function LinkRow({ title, hint, onPress }: LinkRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        {
          backgroundColor: pressed ? colors.surface2 : colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text tone="secondary">{hint}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: { fontWeight: '600' },
});
