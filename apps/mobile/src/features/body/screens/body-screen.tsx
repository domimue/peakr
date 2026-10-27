import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { todayIso } from '@/data/ids';
import { useAccess, useEntitlement } from '@/features/billing/billing-store';
import { LockedCard } from '@/features/billing/locked';
import { HealthOverview } from '@/features/insights/health/health-overview';
import { TabTitle } from '@/features/profile/profile-button';
import { Badge, Button, Card, Screen, spacing, Text } from '@/ui';

import { CheckInSection } from '../components/check-in-section';
import { BodyLockedPreview } from '../components/locked-preview';
import { ProgressSection } from '../components/progress-section';
import { SampleDiary } from '../components/sample';
import { exportBodyData } from '../export';

export type BodySection = 'progress' | 'checkIn';

/**
 * The Body tab (CLAUDE.md "UI patterns → Navigation"): one place for "what my body is doing" –
 * the watch's health data (sleep, HRV, resting heart rate, stress …; part of Training) and, with
 * the Body add-on, weight, body composition, measurements and progress photos. Each part has its
 * own state: health needs the subscription, body tracking the add-on (locked: sample and
 * paywall; switched off: "coming soon").
 */
export function BodyScreen({
  focus = 'progress',
  title = true,
}: {
  /** Deep links: open with the check-in first. */
  focus?: BodySection;
  title?: boolean;
}) {
  const { t } = useTranslation();
  const access = useAccess();
  const guard = useEntitlement('body_nutrition');
  const healthLocked = access === 'preview' || access === 'pending';
  const header = title ? <TabTitle title={t('tabs.body')} /> : undefined;
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const doExport = async (format: 'csv' | 'json') => {
    const result = await exportBodyData(todayIso(), format);
    setExportMessage(result === 'shared' ? null : t('bodyAddon.export.failed'));
  };

  const tracking = !guard.visible ? (
    <Card style={styles.card} testID="body-soon">
      <Badge label={t('comingSoon.label')} />
      <Text variant="heading">{t('bodyTab.soon.title')}</Text>
      <Text tone="secondary">{t('bodyTab.soon.body')}</Text>
    </Card>
  ) : !guard.canRead ? (
    <BodyLockedPreview guard={guard} sample={<SampleDiary />} />
  ) : (
    <>
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
      {focus === 'checkIn' ? <CheckInSection guard={guard} /> : null}
      <ProgressSection guard={guard} />
      {focus === 'checkIn' ? null : <CheckInSection guard={guard} />}
      {/* The user's own data is always exportable, also after the add-on ended. */}
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
    </>
  );

  return (
    <Screen header={header}>
      <Text variant="heading">{t('bodyTab.health')}</Text>
      {healthLocked ? <LockedCard access={access} /> : <HealthOverview />}
      <Text variant="heading">{t('bodyTab.tracking')}</Text>
      {tracking}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
});
