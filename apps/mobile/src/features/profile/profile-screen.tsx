import { activePause } from '@peakr/engine';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { usePlan } from '@/features/plan/queries';
import { useSettingsStore, type ThemePreference } from '@/features/settings/settings-store';
import { Screen, SegmentedControl, SettingsGroup, SettingsRow, type IconName } from '@/ui';

import type { ComingSoonTopic } from './coming-soon-screen';

interface Row {
  icon: IconName;
  title: string;
  value?: string;
  href: Href;
  soon?: boolean;
}

const soon = (topic: ComingSoonTopic): Href => `/coming-soon/${topic}`;

/**
 * Profile: grouped settings rows with icons. Rows of later phases open a "coming soon" page
 * instead of being hidden, so the structure of the app is visible from the start.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const themePreference = useSettingsStore((s) => s.themePreference);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);
  const { data: stored } = usePlan();
  const paused = stored ? activePause(stored.state) !== null : false;

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('profile.themeSystem') },
    { value: 'light', label: t('profile.themeLight') },
    { value: 'dark', label: t('profile.themeDark') },
  ];

  const training: Row[] = [
    { icon: 'tune', title: t('plan.availability.title'), href: '/training/availability' },
    {
      icon: paused ? 'play' : 'pause',
      title: paused ? t('plan.pause.resume') : t('plan.pause.title'),
      href: '/training/pause',
    },
    { icon: 'commute', title: t('plan.commutes.title'), href: '/training/commutes' },
    { icon: 'travel', title: t('plan.travel.title'), href: '/training/travel' },
    { icon: 'winter', title: t('plan.winter.title'), href: '/training/winter' },
    { icon: 'book', title: t('workoutTypes.title'), href: '/training/workout-types' },
    { icon: 'strength', title: t('strength.setup.title'), href: '/strength/setup' },
    { icon: 'structure', title: t('strength.routines.title'), href: '/strength/routines' },
    { icon: 'sessions', title: t('strength.quickLog.title'), href: '/strength/quick-log' },
  ];
  const settings: Row[] = [
    {
      icon: 'units',
      title: t('profile.units'),
      value: t('profile.metric'),
      href: soon('units'),
      soon: true,
    },
    { icon: 'heart', title: t('profile.hrZones'), href: soon('hrZones'), soon: true },
    { icon: 'bell', title: t('profile.notifications'), href: soon('notifications'), soon: true },
    {
      icon: 'language',
      title: t('profile.language'),
      value: 'English',
      href: soon('language'),
      soon: true,
    },
  ];
  const account: Row[] = [
    { icon: 'connections', title: t('profile.connections'), href: soon('connections'), soon: true },
    {
      icon: 'subscription',
      title: t('profile.subscription'),
      href: soon('subscription'),
      soon: true,
    },
    { icon: 'account', title: t('profile.account'), href: soon('account'), soon: true },
    { icon: 'privacy', title: t('profile.privacy'), href: soon('privacy'), soon: true },
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
      <SettingsGroup title={t('profile.appearance')}>
        <SegmentedControl
          options={themeOptions}
          value={themePreference}
          onChange={setThemePreference}
        />
      </SettingsGroup>
      <SettingsGroup title={t('profile.accountGroup')}>{rows(account)}</SettingsGroup>
      <SettingsGroup title={t('profile.about')}>{rows(about)}</SettingsGroup>
    </Screen>
  );
}
