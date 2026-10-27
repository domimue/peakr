import { activePause } from '@peakr/engine';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useSessionStore } from '@/features/auth/session-store';
import { useCanEditPlan } from '@/features/billing/billing-store';
import { usePlan } from '@/features/plan/queries';
import { useWeatherSettings } from '@/features/weather/queries';
import { Screen, SettingsGroup, SettingsRow, Text, type IconName } from '@/ui';

interface Row {
  icon: IconName;
  title: string;
  value?: string;
  href: Href;
}

/**
 * Profile (CLAUDE.md "UI patterns → Navigation"), opened from the icon top right of every screen:
 * the person (personal data, training zones), their goal and plan, the connections to Strava
 * and the watch, and the subscription. How the app behaves is under Settings.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const { data: stored } = usePlan();
  const { data: weather } = useWeatherSettings();
  const session = useSessionStore((s) => (s.isAnonymous ? null : s.session));
  const paused = stored ? activePause(stored.state) !== null : false;
  const canEdit = useCanEditPlan();

  const you: Row[] = [
    { icon: 'account', title: t('profile.personal.title'), href: '/profile/personal' },
    { icon: 'heart', title: t('profile.hrZones'), href: '/training/zones' },
    { icon: 'hills', title: t('terrainProfile.title'), href: '/training/terrain' },
  ];
  const plan: Row[] = [
    // A new plan in the same account; without a subscription or trial the paywall comes first.
    {
      icon: 'plus',
      title: t('planNew.title'),
      ...(stored
        ? { value: t(`quiz.goal.options.${stored.state.plan.goal.kind}.label` as never) as string }
        : {}),
      href: canEdit ? '/plan-new' : '/paywall',
    },
    { icon: 'calendar', title: t('planHistory.title'), href: '/training/plan-history' },
    { icon: 'tune', title: t('plan.availability.title'), href: '/training/availability' },
    { icon: 'bolt', title: t('plan.difficulty.title'), href: '/training/difficulty' },
    {
      icon: paused ? 'play' : 'pause',
      title: paused ? t('plan.pause.resume') : t('plan.pause.title'),
      href: '/training/pause',
    },
    { icon: 'strength', title: t('strength.setup.title'), href: '/strength/setup' },
    { icon: 'commute', title: t('plan.commutes.title'), href: '/training/commutes' },
    { icon: 'travel', title: t('plan.travel.title'), href: '/training/travel' },
    { icon: 'winter', title: t('plan.winter.title'), href: '/training/winter' },
    {
      icon: 'weather',
      title: t('weather.settings.title'),
      value: weather?.enabled ? t('weather.settings.on') : t('weather.settings.off'),
      href: '/training/weather',
    },
    { icon: 'route', title: t('routes.title'), href: '/routes' },
    { icon: 'book', title: t('workoutTypes.title'), href: '/training/workout-types' },
  ];
  const connections: Row[] = [
    { icon: 'connections', title: t('profile.connections'), href: '/integrations' },
    { icon: 'watch', title: t('watch.profileRow'), href: '/watch' },
  ];
  const subscription: Row[] = [
    { icon: 'subscription', title: t('profile.subscription'), href: '/subscription' },
    { icon: 'settings', title: t('settings.title'), href: '/settings' },
  ];

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
      <Text tone="secondary">{session?.user.email ?? t('profile.notSignedIn')}</Text>
      <SettingsGroup title={t('profile.you')}>{rows(you)}</SettingsGroup>
      <SettingsGroup title={t('profile.goalAndPlan')}>{rows(plan)}</SettingsGroup>
      <SettingsGroup title={t('profile.connectionsGroup')}>{rows(connections)}</SettingsGroup>
      <SettingsGroup title={t('profile.subscriptionGroup')}>{rows(subscription)}</SettingsGroup>
    </Screen>
  );
}
