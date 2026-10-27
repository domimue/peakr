import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useSessionStore } from '@/features/auth/session-store';
import { useReminderSettings } from '@/features/notifications/queries';
import { clockText } from '@/features/notifications/reminder-settings';
import { useSettingsStore } from '@/features/settings/settings-store';
import { Screen, SettingsGroup, SettingsRow, type IconName } from '@/ui';

interface Row {
  icon: IconName;
  title: string;
  value?: string;
  href: Href;
}

/**
 * Settings (CLAUDE.md "UI patterns → Navigation"): how the app behaves – notifications, units,
 * appearance, language, haptics – and privacy and the account. What is about the person and
 * their training lives in Profile.
 */
export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { themePreference, units, haptics, language } = useSettingsStore();
  const { data: reminder } = useReminderSettings();
  const session = useSessionStore((s) => (s.isAnonymous ? null : s.session));

  const app: Row[] = [
    {
      icon: 'bell',
      title: t('profile.notifications'),
      value: reminder
        ? reminder.enabled
          ? clockText(reminder.minute, i18n.language)
          : t('notifications.off')
        : undefined,
      href: '/settings/notifications',
    },
    {
      icon: 'units',
      title: t('profile.units'),
      value: units === 'imperial' ? t('settings.units.imperial') : t('settings.units.metric'),
      href: '/settings/units',
    },
    {
      icon: 'appearance',
      title: t('profile.theme'),
      value: {
        system: t('profile.themeSystem'),
        light: t('profile.themeLight'),
        dark: t('profile.themeDark'),
      }[themePreference],
      href: '/settings/appearance',
    },
    {
      icon: 'language',
      title: t('profile.language'),
      value: language === 'system' ? t('settings.language.system') : 'English',
      href: '/settings/language',
    },
    {
      icon: 'bolt',
      title: t('settings.haptics.title'),
      value: haptics ? t('notifications.on') : t('notifications.off'),
      href: '/settings/haptics',
    },
  ];
  const account: Row[] = [
    { icon: 'privacy', title: t('profile.privacy'), href: '/settings/privacy' },
    session
      ? {
          icon: 'account',
          title: t('profile.account'),
          value: session.user.email,
          href: '/auth/account',
        }
      : { icon: 'account', title: t('profile.signIn'), href: '/auth/sign-in' },
  ];
  const about: Row[] = [{ icon: 'info', title: t('profile.licenses'), href: '/licenses' }];
  if (__DEV__) {
    about.push(
      { icon: 'calendar', title: t('dev.planPreview.title'), href: '/dev/plan' },
      { icon: 'sparkles', title: t('dev.brand.title'), href: '/dev/brand' },
    );
  }
  const rows = (list: Row[]) =>
    list.map((r) => (
      <SettingsRow
        key={r.title}
        icon={r.icon}
        title={r.title}
        value={r.value}
        onPress={() => router.push(r.href)}
      />
    ));

  return (
    <Screen>
      <SettingsGroup title={t('settings.groups.app')}>{rows(app)}</SettingsGroup>
      <SettingsGroup title={t('profile.accountGroup')}>{rows(account)}</SettingsGroup>
      <SettingsGroup title={t('profile.about')}>{rows(about)}</SettingsGroup>
    </Screen>
  );
}
