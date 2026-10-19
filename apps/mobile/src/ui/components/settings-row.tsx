import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import { Icon, IconBadge, type IconName } from './icon';
import { Text } from './text';

export interface SettingsRowProps {
  icon: IconName;
  title: string;
  /** Current value on the right, e.g. "Metric". */
  value?: string;
  /** Marks rows of later phases ("Soon"). */
  soonLabel?: string;
  onPress: () => void;
  testID?: string;
}

/** One row of a settings group: icon, title, current value, chevron. */
export function SettingsRow({ icon, title, value, soonLabel, onPress, testID }: SettingsRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[title, value, soonLabel].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surface2 : 'transparent' },
      ]}
    >
      <IconBadge name={icon} color={colors.textMuted} size={32} />
      <Text style={styles.title}>{title}</Text>
      {soonLabel ? (
        <View style={[styles.soon, { borderColor: colors.border }]}>
          <Text variant="micro" tone="secondary">
            {soonLabel}
          </Text>
        </View>
      ) : null}
      {value ? (
        <Text tone="secondary" numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      <Icon name="chevronRight" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export interface SettingsGroupProps {
  title: string;
  children: ReactNode;
}

/** Titled group of settings rows on one surface. */
export function SettingsGroup({ title, children }: SettingsGroupProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      <Text variant="caption" tone="secondary" accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.surface, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 52,
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  title: { flex: 1, fontWeight: '500' },
  value: { maxWidth: '40%' },
  soon: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
  group: { gap: spacing.xs },
  surface: { borderRadius: radius.md, paddingVertical: spacing.xs },
});
