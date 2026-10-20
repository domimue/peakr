import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/ui';

/**
 * Five tabs (CLAUDE.md "UI patterns"): Today, Plan, Gym, Progress, Profile. The calendar is a view
 * inside Plan.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

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
      <NativeTabs.Trigger name="progress">
        <NativeTabs.Trigger.Label>{t('tabs.progress')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar" md="bar_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{t('tabs.profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
