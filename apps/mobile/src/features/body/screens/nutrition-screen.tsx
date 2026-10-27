import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { todayIso } from '@/data/ids';
import { useEntitlement } from '@/features/billing/billing-store';
import { TabTitle } from '@/features/profile/profile-button';
import { Badge, Button, Card, ListState, Screen, spacing, Text } from '@/ui';

import { DiarySection } from '../components/diary-section';
import { HealthLinkCard } from '../components/health-link-card';
import { BodyLockedPreview } from '../components/locked-preview';
import { ProfileSetupCard } from '../components/profile-setup-card';
import { SampleDiary } from '../components/sample';
import { exportBodyData } from '../export';
import { useBodyProfile } from '../profile';

/**
 * The Nutrition tab (CLAUDE.md "UI patterns → Navigation"): the food diary with "Energy today"
 * and the energy targets, part of the Body add-on. While the add-on is switched off the tab is
 * there with its "coming soon" state; locked it shows a sample and the way to the paywall;
 * expired the diary stays readable and exportable.
 */
export function NutritionScreen({ title = true }: { title?: boolean }) {
  const { t } = useTranslation();
  const guard = useEntitlement('body_nutrition');
  const profile = useBodyProfile();
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const header = title ? <TabTitle title={t('tabs.nutrition')} /> : undefined;

  if (!guard.visible) {
    return (
      <Screen header={header}>
        <Card style={styles.card} testID="nutrition-soon">
          <Badge label={t('comingSoon.label')} />
          <Text variant="heading">{t('nutrition.soon.title')}</Text>
          <Text tone="secondary">{t('nutrition.soon.body')}</Text>
        </Card>
      </Screen>
    );
  }
  if (!guard.canRead) {
    return (
      <Screen header={header}>
        <Text tone="secondary">{t('bodyAddon.tagline')}</Text>
        <BodyLockedPreview guard={guard} sample={<SampleDiary />} />
      </Screen>
    );
  }

  const doExport = async (format: 'csv' | 'json') => {
    const result = await exportBodyData(todayIso(), format);
    setExportMessage(result === 'shared' ? null : t('bodyAddon.export.failed'));
  };

  return (
    <Screen header={header}>
      {guard.state === 'expired' ? (
        <Card style={styles.card} testID="body-read-only">
          <Text variant="heading">{t('bodyAddon.readOnly.title')}</Text>
          <Text tone="secondary">{t('bodyAddon.readOnly.body')}</Text>
          <Button
            label={t('bodyAddon.readOnly.reactivate')}
            onPress={() => router.push('/body/addon')}
          />
        </Card>
      ) : null}
      {guard.isTrial ? (
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.trialActive')}
        </Text>
      ) : null}
      {profile.isPending ? (
        <ListState kind="loading" label={t('common.loading')} />
      ) : profile.data && profile.data.missing.length > 0 && guard.canWrite ? (
        <ProfileSetupCard state={profile.data} />
      ) : null}
      {guard.canWrite ? <HealthLinkCard /> : null}

      <DiarySection guard={guard} />

      <Button
        variant="secondary"
        icon="upload"
        label={t('bodyAddon.export.action')}
        onPress={() => void doExport('csv')}
      />
      <Button
        variant="secondary"
        icon="upload"
        label={t('bodyAddon.export.actionJson')}
        onPress={() => void doExport('json')}
      />
      {exportMessage ? <Text tone="secondary">{exportMessage}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
});
