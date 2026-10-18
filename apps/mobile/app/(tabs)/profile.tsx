import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useSettingsStore, type ThemePreference } from '@/features/settings/settings-store';
import { LinkRow, Screen, SegmentedControl, Text } from '@/ui';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const themePreference = useSettingsStore((s) => s.themePreference);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);

  const options: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('profile.themeSystem') },
    { value: 'light', label: t('profile.themeLight') },
    { value: 'dark', label: t('profile.themeDark') },
  ];

  return (
    <Screen title={t('profile.title')}>
      <Text variant="heading">{t('profile.strength')}</Text>
      <LinkRow
        title={t('strength.setup.title')}
        hint={t('strength.setup.entryHint')}
        onPress={() => router.push('/strength/setup')}
      />
      <LinkRow
        title={t('strength.routines.title')}
        hint={t('strength.routines.entryHint')}
        onPress={() => router.push('/strength/routines')}
      />
      <LinkRow
        title={t('strength.quickLog.title')}
        hint={t('strength.quickLog.entryHint')}
        onPress={() => router.push('/strength/quick-log')}
      />

      <Text variant="heading">{t('profile.appearance')}</Text>
      <SegmentedControl options={options} value={themePreference} onChange={setThemePreference} />

      {/* Developer tools: development builds only. */}
      {__DEV__ ? (
        <LinkRow
          title={t('dev.planPreview.title')}
          hint={t('dev.planPreview.entryHint')}
          onPress={() => router.push('/dev/plan')}
        />
      ) : null}
    </Screen>
  );
}
