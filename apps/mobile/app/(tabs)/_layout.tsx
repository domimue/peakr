import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/ui';

/**
 * Five tabs (CLAUDE.md "UI patterns → Navigation"): Today, Plan, Gym, Nutrition, Body. Profile and
 * Settings open from the profile icon top right of every screen; training history and records
 * are the third segment of Plan; Body holds the watch's health data and the body tracking. The
 * Body add-on flag only decides what Nutrition and Body show (content, preview or "coming soon"),
 * never which tabs exist.
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
      <NativeTabs.Trigger name="nutrition">
        <NativeTabs.Trigger.Label>{t('tabs.nutrition')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="fork.knife" md="restaurant" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="body">
        <NativeTabs.Trigger.Label>{t('tabs.body')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="figure.stand" md="accessibility_new" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
