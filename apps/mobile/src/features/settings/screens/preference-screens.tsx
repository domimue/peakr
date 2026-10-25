import { useTranslation } from 'react-i18next';

import { ChoiceList, Screen, Text } from '@/ui';

import type { LanguagePreference, ThemePreference, Units } from '../app-settings';
import { useSettingsStore } from '../settings-store';

/** Profile → Units: metric (default) or imperial for distances and paces. */
export function UnitsScreen() {
  const { t } = useTranslation();
  const units = useSettingsStore((s) => s.units);
  const setUnits = useSettingsStore((s) => s.setUnits);
  return (
    <Screen>
      <ChoiceList<Units>
        label={t('settings.units.label')}
        choices={[
          {
            value: 'metric',
            label: t('settings.units.metric'),
            description: t('settings.units.metricHint'),
          },
          {
            value: 'imperial',
            label: t('settings.units.imperial'),
            description: t('settings.units.imperialHint'),
          },
        ]}
        value={units}
        onChange={setUnits}
      />
      <Text variant="caption" tone="secondary">
        {t('settings.units.note')}
      </Text>
    </Screen>
  );
}

/** Profile → Appearance: dark by default, light optional, or follow the system. */
export function AppearanceScreen() {
  const { t } = useTranslation();
  const themePreference = useSettingsStore((s) => s.themePreference);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);
  return (
    <Screen>
      <ChoiceList<ThemePreference>
        label={t('profile.appearance')}
        choices={[
          { value: 'dark', label: t('profile.themeDark') },
          { value: 'light', label: t('profile.themeLight') },
          {
            value: 'system',
            label: t('profile.themeSystem'),
            description: t('settings.appearance.systemHint'),
          },
        ]}
        value={themePreference}
        onChange={setThemePreference}
      />
    </Screen>
  );
}

/** Profile → Haptics: the short vibration when a session or a set is done, and on the keypad. */
export function HapticsScreen() {
  const { t } = useTranslation();
  const haptics = useSettingsStore((s) => s.haptics);
  const setHaptics = useSettingsStore((s) => s.setHaptics);
  return (
    <Screen>
      <ChoiceList<'on' | 'off'>
        label={t('settings.haptics.label')}
        choices={[
          { value: 'on', label: t('notifications.on'), description: t('settings.haptics.onHint') },
          { value: 'off', label: t('notifications.off') },
        ]}
        value={haptics ? 'on' : 'off'}
        onChange={(v) => setHaptics(v === 'on')}
      />
    </Screen>
  );
}

/** Profile → Language: English ships first; the device language is used once Peakr has it. */
export function LanguageScreen() {
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  return (
    <Screen>
      <ChoiceList<LanguagePreference>
        label={t('profile.language')}
        choices={[
          {
            value: 'system',
            label: t('settings.language.system'),
            description: t('settings.language.systemHint'),
          },
          { value: 'en', label: 'English' },
        ]}
        value={language}
        onChange={setLanguage}
      />
      <Text variant="caption" tone="secondary">
        {t('settings.language.more')}
      </Text>
    </Screen>
  );
}
