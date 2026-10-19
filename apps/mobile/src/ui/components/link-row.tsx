import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import { Icon, IconBadge, type IconName } from './icon';
import { Text } from './text';

export interface LinkRowProps {
  title: string;
  hint?: string;
  /** Leading icon in a tinted badge. */
  icon?: IconName;
  onPress: () => void;
}

/** Tappable row that opens another screen (Profile entries, routine list items). */
export function LinkRow({ title, hint, icon, onPress }: LinkRowProps) {
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
      {icon ? <IconBadge name={icon} color={colors.textMuted} /> : null}
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {hint ? <Text tone="secondary">{hint}</Text> : null}
      </View>
      <Icon name="chevronRight" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: { flex: 1, gap: spacing.xs },
  title: { fontWeight: '600' },
});
