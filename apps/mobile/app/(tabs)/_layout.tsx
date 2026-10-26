import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';

import { useRemoteFlag } from '@/config/remote-flags';
import { useTheme } from '@/ui';

/**
 * Five tabs (CLAUDE.md "UI patterns"): Today, Plan, Gym, Body, Profile. The calendar is a view
 * inside Plan. Body takes the fourth slot while the add-on is switched on (remote flag
 * `addon_body_nutrition`) – the bar holds five at most, on Android natively so – and Insights
 * (Health, Training, Records) then opens from Profile and Today (`/training/insights`). With the
 * flag off the bar is the one before: Insights in the fourth slot, no Body.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const body = useRemoteFlag('addon_body_nutrition');

  return (
    <NativeTabs
      backgroundColor={colors.bg}
      indicatorColor={colors.surface2}
      tintColor={colors.accentLine}
      labelStyle={{ selected: { color: colors.text } }}
    >
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Label>{t('tabs.today')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sun.max" md="today" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan">
        <NativeTabs.Trigger.Label>{t('tabs.plan')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet.rectangle" md="view_agenda" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="gym">
        <NativeTabs.Trigger.Label>{t('tabs.gym')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="dumbbell" md="fitness_center" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="body" hidden={!body}>
        <NativeTabs.Trigger.Label>{t('tabs.body')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="figure.stand" md="accessibility_new" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="insights" hidden={body}>
        <NativeTabs.Trigger.Label>{t('tabs.insights')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar" md="bar_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{t('tabs.profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
