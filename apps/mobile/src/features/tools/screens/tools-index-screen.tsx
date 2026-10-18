import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { radius, Screen, spacing, Text, useTheme } from '@/ui';

const TOOLS = [
  { key: 'hrZones', href: '/tools/heart-rate-zones' },
  { key: 'zone2', href: '/tools/zone-2' },
  { key: 'pace', href: '/tools/pace' },
  { key: 'swim', href: '/tools/swim-css' },
] as const satisfies readonly { key: string; href: Href }[];

export function ToolsIndexScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Screen title={t('tools.title')}>
      <Text tone="secondary">{t('tools.subtitle')}</Text>
      <View style={styles.list}>
        {TOOLS.map((tool) => (
          <Pressable
            key={tool.key}
            accessibilityRole="link"
            onPress={() => router.push(tool.href)}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: pressed ? colors.surfaceSelected : colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text variant="heading">{t(`tools.${tool.key}.title`)}</Text>
            <Text tone="secondary">{t(`tools.${tool.key}.description`)}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  item: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
