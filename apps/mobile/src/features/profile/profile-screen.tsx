import { activePause } from '@peakr/engine';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useSessionStore } from '@/features/auth/session-store';
import { usePlan } from '@/features/plan/queries';
import { useReminderSettings } from '@/features/notifications/queries';
import { clockText } from '@/features/notifications/reminder-settings';
import { useSettingsStore } from '@/features/settings/settings-store';
import { useWeatherSettings } from '@/features/weather/queries';
import { Screen, SettingsGroup, SettingsRow, type IconName } from '@/ui';

interface Row {
  icon: IconName;
  title: string;
  value?: string;
  href: Href;
  soon?: boolean;
}

/** Profile: grouped settings rows with icons (CLAUDE.md "UI patterns"). */
export function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const { themePreference, units, haptics, language } = useSettingsStore();
  const { data: reminder } = useReminderSettings();
  const { data: stored } = usePlan();
  const { data: weather } = useWeatherSettings();
  const session = useSessionStore((s) => (s.isAnonymous ? null : s.session));
  const paused = stored ? activePause(stored.state) !== null : false;

  const themeLabel = {
    system: t('profile.themeSystem'),
    light: t('profile.themeLight'),
    dark: t('profile.themeDark'),
  }[themePreference];

  const training: Row[] = [
    { icon: 'tune', title: t('plan.availability.title'), href: '/training/availability' },
    {
      icon: paused ? 'play' : 'pause',
      title: paused ? t('plan.pause.resume') : t('plan.pause.title'),
      href: '/training/pause',
    },
    { icon: 'route', title: t('routes.title'), href: '/routes' },
    { icon: 'hills', title: t('terrainProfile.title'), href: '/training/terrain' },
    { icon: 'commute', title: t('plan.commutes.title'), href: '/training/commutes' },
    { icon: 'travel', title: t('plan.travel.title'), href: '/training/travel' },
    { icon: 'winter', title: t('plan.winter.title'), href: '/training/winter' },
    { icon: 'book', title: t('workoutTypes.title'), href: '/training/workout-types' },
    { icon: 'strength', title: t('strength.setup.title'), href: '/strength/setup' },
  ];
  const settings: Row[] = [
    {
      icon: 'units',
      title: t('profile.units'),
      value: units === 'imperial' ? t('settings.units.imperial') : t('settings.units.metric'),
      href: '/settings/units',
    },
    { icon: 'heart', title: t('profile.hrZones'), href: '/training/zones' },
    {
      icon: 'weather',
      title: t('weather.settings.title'),
      value: weather?.enabled ? t('weather.settings.on') : t('weather.settings.off'),
      href: '/training/weather',
    },
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
      icon: 'bolt',
      title: t('settings.haptics.title'),
      value: haptics ? t('notifications.on') : t('notifications.off'),
      href: '/settings/haptics',
    },
    {
      icon: 'language',
      title: t('profile.language'),
      value: language === 'system' ? t('settings.language.system') : 'English',
      href: '/settings/language',
    },
  ];
  const appearance: Row[] = [
    {
      icon: 'appearance',
      title: t('profile.theme'),
      value: themeLabel,
      href: '/settings/appearance',
    },
  ];
  const account: Row[] = [
    { icon: 'watch', title: t('watch.profileRow'), href: '/watch' },
    { icon: 'connections', title: t('profile.connections'), href: '/integrations' },
    { icon: 'subscription', title: t('profile.subscription'), href: '/subscription' },
    session
      ? {
          icon: 'account',
          title: t('profile.account'),
          value: session.user.email,
          href: '/auth/account',
        }
      : { icon: 'account', title: t('profile.signIn'), href: '/auth/sign-in' },
    { icon: 'privacy', title: t('profile.privacy'), href: '/settings/privacy' },
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
        soonLabel={r.soon ? t('comingSoon.short') : undefined}
        onPress={() => router.push(r.href)}
      />
    ));

  return (
    <Screen title={t('profile.title')}>
      <SettingsGroup title={t('profile.training')}>{rows(training)}</SettingsGroup>
      <SettingsGroup title={t('profile.settings')}>{rows(settings)}</SettingsGroup>
      <SettingsGroup title={t('profile.appearance')}>{rows(appearance)}</SettingsGroup>
      <SettingsGroup title={t('profile.accountGroup')}>{rows(account)}</SettingsGroup>
      <SettingsGroup title={t('profile.about')}>{rows(about)}</SettingsGroup>
    </Screen>
  );
}
