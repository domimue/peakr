import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import { Text } from './text';

export interface BadgeProps {
  label: string;
}

/** Small neutral pill, e.g. to mark a value as an estimate. */
export function Badge({ label }: BadgeProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { borderColor: colors.border }]}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
