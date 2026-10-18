import { useTranslation } from 'react-i18next';

import { useSettingsStore, type ThemePreference } from '@/features/settings/settings-store';
import { Screen, SegmentedControl, Text } from '@/ui';

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
      <Text variant="heading">{t('profile.appearance')}</Text>
      <SegmentedControl options={options} value={themePreference} onChange={setThemePreference} />
    </Screen>
  );
}
