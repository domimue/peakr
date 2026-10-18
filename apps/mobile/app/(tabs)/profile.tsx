import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSettingsStore, type ThemePreference } from '@/features/settings/settings-store';
import { radius, Screen, SegmentedControl, spacing, Text, useTheme } from '@/ui';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const themePreference = useSettingsStore((s) => s.themePreference);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);

  const options: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('profile.themeSystem') },
    { value: 'light', label: t('profile.themeLight') },
    { value: 'dark', label: t('profile.themeDark') },
  ];

  return (
    <Screen title={t('profile.title')}>
      <Text variant="heading">{t('profile.appearance')}</Text>
      <SegmentedControl options={options} value={themePreference} onChange={setThemePreference} />

      {/* Developer tools: development builds only. */}
      {__DEV__ ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/dev/plan')}
          style={({ pressed }) => [
            styles.item,
            {
              backgroundColor: pressed ? colors.surfaceSelected : colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={styles.itemTitle}>{t('dev.planPreview.title')}</Text>
          <Text tone="secondary">{t('dev.planPreview.entryHint')}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemTitle: { fontWeight: '600' },
});
