import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import { Text } from './text';

export interface StatTileProps {
  value: string;
  label: string;
  testID?: string;
}

/** A figure with its label (summary rows on Today and Progress). */
export function StatTile({ value, label, testID }: StatTileProps) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.tile, { backgroundColor: colors.surface }]}
    >
      <Text variant="heading">{value}</Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '40%',
    borderRadius: radius.md,
    padding: spacing.sm + spacing.xs,
    gap: 2,
  },
});
